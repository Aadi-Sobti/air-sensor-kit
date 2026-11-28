"""A small grid router for a simple 2-layer board, using KiCad's pcbnew API (pure Python, no numpy).

Each net is routed pad by pad with A* on a grid (8 directions per layer, vias between layers). Everything that
belongs to another net (pads, tracks, vias), the board edge and any keep-out is blocked with the clearance plus half
the new track's width added. KiCad's own DRC then checks the result, so this only has to be good, not perfect.
"""
import heapq
import math

import pcbnew

F, B = 0, 1
LAYER_IDS = {F: pcbnew.F_Cu, B: pcbnew.B_Cu}
DIRS = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]


def nm(v):
    return pcbnew.FromMM(v)


def to_mm(v):
    return pcbnew.ToMM(v)


class Router:
    def __init__(self, board, pitch=0.2, clearance=0.2, edge_clear=0.5, via_d=0.6, via_drill=0.3, b_cost=2.0,
                 via_cost=12.0, turn_cost=0.4):
        self.b = board
        self.pitch = pitch
        self.clear = clearance
        self.edge = edge_clear
        self.via_d = via_d
        self.via_drill = via_drill
        self.b_cost = b_cost
        self.via_cost = via_cost
        self.turn_cost = turn_cost
        xs, ys = [], []
        for d in board.GetDrawings():   # the Edge.Cuts outline (the SWIG bounding-box call is unreliable here)
            if d.GetLayer() == pcbnew.Edge_Cuts:
                for q in (d.GetStart(), d.GetEnd()):
                    xs.append(to_mm(q.x))
                    ys.append(to_mm(q.y))
        self.x0, self.y0 = min(xs), min(ys)
        self.w, self.h = max(xs) - self.x0, max(ys) - self.y0
        self.nx = int(self.w / pitch) + 1
        self.ny = int(self.h / pitch) + 1
        self.keepouts = []   # (layer or None for both, x0, y0, x1, y1) in mm
        self.via_keepouts = []   # (x0, y0, x1, y1) in mm: no vias (tracks allowed)
        self.failed = []

    # ---- geometry -------------------------------------------------------------------------------------------
    def cell(self, x, y):
        return int(round((x - self.x0) / self.pitch)), int(round((y - self.y0) / self.pitch))

    def xy(self, i, j):
        return self.x0 + i * self.pitch, self.y0 + j * self.pitch

    def _mark_rect(self, grid, x0, y0, x1, y1):
        i0 = max(0, int(math.ceil((x0 - self.x0) / self.pitch)))
        i1 = min(self.nx - 1, int(math.floor((x1 - self.x0) / self.pitch)))
        j0 = max(0, int(math.ceil((y0 - self.y0) / self.pitch)))
        j1 = min(self.ny - 1, int(math.floor((y1 - self.y0) / self.pitch)))
        for j in range(j0, j1 + 1):
            row = j * self.nx
            for i in range(i0, i1 + 1):
                grid[row + i] = 1

    def _mark_capsule(self, grid, ax, ay, bx, by, r):
        x0, x1 = min(ax, bx) - r, max(ax, bx) + r
        y0, y1 = min(ay, by) - r, max(ay, by) + r
        i0 = max(0, int(math.ceil((x0 - self.x0) / self.pitch)))
        i1 = min(self.nx - 1, int(math.floor((x1 - self.x0) / self.pitch)))
        j0 = max(0, int(math.ceil((y0 - self.y0) / self.pitch)))
        j1 = min(self.ny - 1, int(math.floor((y1 - self.y0) / self.pitch)))
        dx, dy = bx - ax, by - ay
        ll = dx * dx + dy * dy
        r2 = r * r
        for j in range(j0, j1 + 1):
            py = self.y0 + j * self.pitch
            row = j * self.nx
            for i in range(i0, i1 + 1):
                px = self.x0 + i * self.pitch
                t = 0.0 if ll == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / ll))
                qx, qy = ax + t * dx - px, ay + t * dy - py
                if qx * qx + qy * qy <= r2:
                    grid[row + i] = 1

    def _pad_rect(self, pad, grow):
        bb = pad.GetBoundingBox()
        return (to_mm(bb.GetX()) - grow, to_mm(bb.GetY()) - grow, to_mm(bb.GetRight()) + grow,
                to_mm(bb.GetBottom()) + grow)

    @staticmethod
    def _pad_layers(pad):
        return [L for L in (F, B) if pad.IsOnLayer(LAYER_IDS[L])]

    def blocked(self, netcode, half_w):
        """Two grids (F, B) of cells a track of half-width half_w on this net may not use, plus a via grid."""
        n = self.nx * self.ny
        g = [bytearray(n), bytearray(n)]
        v = bytearray(n)
        grow = self.clear + half_w
        vgrow = self.clear + self.via_d / 2
        # board edge
        for grid, e in ((g[F], self.edge + half_w), (g[B], self.edge + half_w), (v, self.edge + self.via_d / 2)):
            self._mark_rect(grid, self.x0 - 1, self.y0 - 1, self.x0 + self.w + 1, self.y0 + e)
            self._mark_rect(grid, self.x0 - 1, self.y0 + self.h - e, self.x0 + self.w + 1, self.y0 + self.h + 1)
            self._mark_rect(grid, self.x0 - 1, self.y0 - 1, self.x0 + e, self.y0 + self.h + 1)
            self._mark_rect(grid, self.x0 + self.w - e, self.y0 - 1, self.x0 + self.w + 1, self.y0 + self.h + 1)
        for (L, x0, y0, x1, y1) in self.keepouts:
            for layer in ((F, B) if L is None else (L,)):
                self._mark_rect(g[layer], x0 - half_w, y0 - half_w, x1 + half_w, y1 + half_w)
            self._mark_rect(v, x0 - self.via_d / 2, y0 - self.via_d / 2, x1 + self.via_d / 2, y1 + self.via_d / 2)
        for fp in self.b.GetFootprints():
            for pad in fp.Pads():
                layers = self._pad_layers(pad)
                if pad.GetNetCode() == netcode and netcode > 0:
                    if layers:   # tracks may enter their own pads, but no via goes in or touches any pad
                        self._mark_rect(v, *self._pad_rect(pad, vgrow))
                    continue
                for L in layers:
                    self._mark_rect(g[L], *self._pad_rect(pad, grow))
                if layers:
                    self._mark_rect(v, *self._pad_rect(pad, vgrow))
                if pad.HasHole():   # drilled holes block vias and tracks on both layers
                    for L in (F, B):
                        self._mark_rect(g[L], *self._pad_rect(pad, grow))
        for (x0, y0, x1, y1) in self.via_keepouts:
            self._mark_rect(v, x0 - self.via_d / 2, y0 - self.via_d / 2, x1 + self.via_d / 2, y1 + self.via_d / 2)
        for t in self.b.GetTracks():
            if t.GetNetCode() == netcode and netcode > 0:
                if t.GetClass() == "PCB_VIA":   # a new via can't sit on (or touch) one of this net's vias either
                    c = t.GetPosition()
                    self._mark_capsule(v, to_mm(c.x), to_mm(c.y), to_mm(c.x), to_mm(c.y),
                                       to_mm(t.GetWidth(pcbnew.F_Cu)) / 2 + vgrow)
                continue
            if isinstance(t, pcbnew.PCB_VIA) or t.GetClass() == "PCB_VIA":
                c = t.GetPosition()
                r = to_mm(t.GetWidth(pcbnew.F_Cu)) / 2
                for L in (F, B):
                    self._mark_capsule(g[L], to_mm(c.x), to_mm(c.y), to_mm(c.x), to_mm(c.y), r + grow)
                self._mark_capsule(v, to_mm(c.x), to_mm(c.y), to_mm(c.x), to_mm(c.y), r + vgrow)
                continue
            L = F if t.GetLayer() == pcbnew.F_Cu else B
            s, e = t.GetStart(), t.GetEnd()
            r = to_mm(t.GetWidth()) / 2
            self._mark_capsule(g[L], to_mm(s.x), to_mm(s.y), to_mm(e.x), to_mm(e.y), r + grow)
            self._mark_capsule(v, to_mm(s.x), to_mm(s.y), to_mm(e.x), to_mm(e.y), r + vgrow)
        return g, v

    def pad_cells(self, pad, own_tracks_ok=True):
        """Grid cells whose centre is really on the pad's copper (round and oval pads included), on each copper layer."""
        x0, y0, x1, y1 = self._pad_rect(pad, -0.05)
        cells = []
        for L in self._pad_layers(pad):
            i0, j0 = self.cell(x0, y0)
            i1, j1 = self.cell(x1, y1)
            for j in range(max(0, j0), min(self.ny - 1, j1) + 1):
                for i in range(max(0, i0), min(self.nx - 1, i1) + 1):
                    px, py = self.xy(i, j)
                    if x0 <= px <= x1 and y0 <= py <= y1 and pad.HitTest(pcbnew.VECTOR2I(nm(px), nm(py)), 0):
                        cells.append((i, j, L))
            c = pad.GetPosition()
            ci, cj = self.cell(to_mm(c.x), to_mm(c.y))
            cells.append((ci, cj, L))
        return cells

    # ---- search ---------------------------------------------------------------------------------------------
    def astar(self, starts, goals, g, v, layers):
        nx = self.nx
        clean = [c for c in goals if c[2] in layers and not g[c[2]][c[1] * nx + c[0]]]
        if clean:
            goals = clean
        clean_s = [c for c in starts if c[2] in layers and not g[c[2]][c[1] * nx + c[0]]]
        if clean_s:
            starts = clean_s
        goalset = set(goals)
        if not goalset:
            return None
        gi = [c[0] for c in goals]
        gj = [c[1] for c in goals]
        gx0, gx1, gy0, gy1 = min(gi), max(gi), min(gj), max(gj)

        def h(i, j):
            dx = 0 if gx0 <= i <= gx1 else min(abs(i - gx0), abs(i - gx1))
            dy = 0 if gy0 <= j <= gy1 else min(abs(j - gy0), abs(j - gy1))
            return max(dx, dy) + 0.414 * min(dx, dy)

        nx = self.nx
        openh = []
        best = {}
        came = {}
        for (i, j, L) in starts:
            if L not in layers:
                continue
            st = (i, j, L, -1)
            best[st] = 0.0
            heapq.heappush(openh, (h(i, j), 0.0, st))
        while openh:
            f, cost, st = heapq.heappop(openh)
            if best.get(st, 1e18) < cost:
                continue
            i, j, L, d = st
            if (i, j, L) in goalset:
                path = [(i, j, L)]
                while st in came:
                    st = came[st]
                    path.append((st[0], st[1], st[2]))
                return path[::-1]
            mult = self.b_cost if L == B else 1.0
            for k, (di, dj) in enumerate(DIRS):
                a, bb = i + di, j + dj
                if a < 0 or bb < 0 or a >= nx or bb >= self.ny:
                    continue
                if g[L][bb * nx + a] and (a, bb, L) not in goalset:
                    continue
                if di and dj and (g[L][j * nx + a] or g[L][bb * nx + i]):   # no corner cutting past obstacles
                    if (a, bb, L) not in goalset:
                        continue
                step = (1.414 if di and dj else 1.0) * mult + (self.turn_cost if d not in (-1, k) else 0.0)
                ns = (a, bb, L, k)
                nc = cost + step
                if nc < best.get(ns, 1e18):
                    best[ns] = nc
                    came[ns] = st
                    heapq.heappush(openh, (nc + h(a, bb), nc, ns))
            # via
            if len(layers) == 2 and not v[j * nx + i]:
                L2 = B if L == F else F
                if not g[L2][j * nx + i] or (i, j, L2) in goalset:
                    ns = (i, j, L2, -1)
                    nc = cost + self.via_cost
                    if nc < best.get(ns, 1e18):
                        best[ns] = nc
                        came[ns] = st
                        heapq.heappush(openh, (nc + h(i, j), nc, ns))
        return None

    # ---- output ---------------------------------------------------------------------------------------------
    def _emit(self, path, net, width):
        segs, vias = [], []
        if len(path) < 2:
            return
        run = [path[0]]
        for p in path[1:]:
            prev = run[-1]
            if p[2] != prev[2]:
                self._seg(run, net, width)
                vias.append(prev)
                run = [p]
                continue
            if len(run) >= 2:
                d0 = (run[-1][0] - run[-2][0], run[-1][1] - run[-2][1])
                d1 = (p[0] - prev[0], p[1] - prev[1])
                if d0 != d1:
                    self._seg(run, net, width)
                    run = [prev]
            run.append(p)
        self._seg(run, net, width)
        for (i, j, L) in vias:
            via = pcbnew.PCB_VIA(self.b)
            x, y = self.xy(i, j)
            via.SetPosition(pcbnew.VECTOR2I(nm(x), nm(y)))
            via.SetWidth(nm(self.via_d))
            via.SetDrill(nm(self.via_drill))
            via.SetNet(net)
            self.b.Add(via)

    def _seg(self, run, net, width):
        if len(run) < 2:
            return
        (i0, j0, L), (i1, j1, _) = run[0], run[-1]
        t = pcbnew.PCB_TRACK(self.b)
        x0, y0 = self.xy(i0, j0)
        x1, y1 = self.xy(i1, j1)
        t.SetStart(pcbnew.VECTOR2I(nm(x0), nm(y0)))
        t.SetEnd(pcbnew.VECTOR2I(nm(x1), nm(y1)))
        t.SetWidth(nm(width))
        t.SetLayer(LAYER_IDS[L])
        t.SetNet(net)
        self.b.Add(t)

    def own_track_cells(self, netcode):
        """Grid cells already covered by this net's tracks and vias (so new branches can join them)."""
        cells = set()
        for t in self.b.GetTracks():
            if t.GetNetCode() != netcode:
                continue
            if t.GetClass() == "PCB_VIA":
                c = t.GetPosition()
                i, j = self.cell(to_mm(c.x), to_mm(c.y))
                cells.update({(i, j, F), (i, j, B)})
                continue
            L = F if t.GetLayer() == pcbnew.F_Cu else B
            s, e = t.GetStart(), t.GetEnd()
            (i0, j0), (i1, j1) = self.cell(to_mm(s.x), to_mm(s.y)), self.cell(to_mm(e.x), to_mm(e.y))
            n = max(abs(i1 - i0), abs(j1 - j0), 1)
            for k in range(n + 1):
                cells.add((round(i0 + (i1 - i0) * k / n), round(j0 + (j1 - j0) * k / n), L))
        return cells

    def route_net(self, netname, width, layers=(F, B), only=None, use_existing=True):
        """Connect a net's pads. With only=["R1.1", ...], connect just those pads to whatever copper the net already
        has (or to each other), so one net can have a wide trunk and narrower branches."""
        net = self.b.FindNet(netname)
        if net is None:
            raise KeyError(netname)
        pads = [p for fp in self.b.GetFootprints() for p in fp.Pads() if p.GetNetCode() == net.GetNetCode()]
        if only is not None:
            pads = [p for p in pads if p.GetParentFootprint().GetReference() + "." + p.GetNumber() in only]
        existing = self.own_track_cells(net.GetNetCode()) if use_existing else set()
        if len(pads) < 2 and not (pads and existing):
            return True
        g, v = self.blocked(net.GetNetCode(), width / 2)
        if existing:
            tree = set(existing)
            todo = [p for p in pads if not (set(self.pad_cells(p)) & tree)]
            tree.update(c for p in pads if set(self.pad_cells(p)) & existing for c in self.pad_cells(p))
        else:
            tree = set(self.pad_cells(pads[0]))
            todo = pads[1:]
        ok = True
        while todo:
            # nearest remaining pad to the tree first
            def dist(p):
                c = p.GetPosition()
                ci, cj = self.cell(to_mm(c.x), to_mm(c.y))
                return min(abs(ci - a) + abs(cj - b) for (a, b, _) in tree)
            todo.sort(key=dist)
            pad = todo.pop(0)
            goals = self.pad_cells(pad)
            path = self.astar(list(tree), goals, g, v, layers)
            if path is None:
                self.failed.append((netname, pad.GetParentFootprint().GetReference() + "." + pad.GetNumber()))
                ok = False
                continue
            self._emit(path, net, width)
            tree.update(path)
            tree.update(goals)
        return ok


def track(board, netname, pts, width, layer=pcbnew.F_Cu):
    """A hand-placed track through the given (x, y) points in mm (absolute page coordinates)."""
    net = board.FindNet(netname)
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        t = pcbnew.PCB_TRACK(board)
        t.SetStart(pcbnew.VECTOR2I(nm(x0), nm(y0)))
        t.SetEnd(pcbnew.VECTOR2I(nm(x1), nm(y1)))
        t.SetWidth(nm(width))
        t.SetLayer(layer)
        t.SetNet(net)
        board.Add(t)


def via_stubs(router, netname, refs_pads, width=0.6, per_pad=1):
    """Drop a via next to each listed SMD pad ("REF.PAD") and join it with a short top-layer track."""
    net = router.b.FindNet(netname)
    made = 0
    for key in refs_pads:
        ref, num = key.split(".")
        fp = router.b.FindFootprintByReference(ref)
        pad = [p for p in fp.Pads() if p.GetNumber() == num][0]
        for _ in range(per_pad):
            g, v = router.blocked(net.GetNetCode(), width / 2)
            starts = router.pad_cells(pad)
            goals = [(i, j, F) for j in range(router.ny) for i in range(router.nx)
                     if not v[j * router.nx + i] and not g[F][j * router.nx + i] and not g[B][j * router.nx + i]
                     and min(abs(i - a) + abs(j - b) for (a, b, _) in starts) <= int(4.0 / router.pitch)]
            goals = [c for c in goals if c not in set(starts)]
            path = router.astar(starts, goals, g, v, (F,))
            if path is None:
                # no room for a via nearby: join the pad to this net's existing tracks/vias on the top layer instead
                g2, v2 = router.blocked(net.GetNetCode(), 0.15)
                own = [c for c in router.own_track_cells(net.GetNetCode()) if c[2] == F]
                path = router.astar(starts, own, g2, v2, (F,))
                if path is None:
                    router.failed.append((netname, key + " via"))
                else:
                    router._emit(path, net, 0.3)
                    made += 1
                break
            router._emit(path, net, width)
            i, j, _ = path[-1]
            via = pcbnew.PCB_VIA(router.b)
            x, y = router.xy(i, j)
            via.SetPosition(pcbnew.VECTOR2I(nm(x), nm(y)))
            via.SetWidth(nm(router.via_d))
            via.SetDrill(nm(router.via_drill))
            via.SetNet(net)
            router.b.Add(via)
            made += 1
    return made


def stitch(router, netname, spacing=4.0, margin=2.0):
    """Ground vias on a regular grid wherever one fits, so the top and bottom ground pours join up."""
    net = router.b.FindNet(netname)
    g, v = router.blocked(net.GetNetCode(), router.via_d / 2)
    n = 0
    y = router.y0 + margin
    while y <= router.y0 + router.h - margin:
        x = router.x0 + margin
        while x <= router.x0 + router.w - margin:
            i, j = router.cell(x, y)
            if not v[j * router.nx + i] and not g[F][j * router.nx + i] and not g[B][j * router.nx + i]:
                via = pcbnew.PCB_VIA(router.b)
                via.SetPosition(pcbnew.VECTOR2I(nm(x), nm(y)))
                via.SetWidth(nm(router.via_d))
                via.SetDrill(nm(router.via_drill))
                via.SetNet(net)
                router.b.Add(via)
                n += 1
            x += spacing
        y += spacing
    return n


def add_zone(board, netname, layer, x0, y0, x1, y1, clearance=0.3, min_w=0.25, thermal_gap=0.3, spoke=0.4,
             priority=0):
    net = board.FindNet(netname)
    z = pcbnew.ZONE(board)
    z.SetLayer(layer)
    z.SetNetCode(net.GetNetCode())
    ol = z.Outline()
    ol.NewOutline()
    for (x, y) in ((x0, y0), (x1, y0), (x1, y1), (x0, y1)):
        ol.Append(nm(x), nm(y))
    z.SetLocalClearance(nm(clearance))
    z.SetMinThickness(nm(min_w))
    z.SetThermalReliefGap(nm(thermal_gap))
    z.SetThermalReliefSpokeWidth(nm(spoke))
    z.SetAssignedPriority(priority)
    board.Add(z)
    return z


def fill_zones(board):
    filler = pcbnew.ZONE_FILLER(board)
    filler.Fill(board.Zones())
