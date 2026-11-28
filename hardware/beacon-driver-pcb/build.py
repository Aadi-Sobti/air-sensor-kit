"""Build the Help-First beacon driver PCB (KiCad 10) from design.json: schematic, board, routing, checks, JLCPCB files.

Run it with the Python that ships inside KiCad 10 (it needs KiCad's `pcbnew` module):

    KICAD_APP=/Applications/KiCad/KiCad.app \
    /Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/Current/bin/python3 build.py

It writes beacon-driver.kicad_sch / .kicad_pcb / .kicad_pro, runs KiCad's ERC and DRC (with schematic parity),
and writes jlcpcb/ (Gerbers + drill zip, BOM, CPL) and pictures. It exits non-zero if a check fails.
"""
import csv
import json
import os
import shutil
import subprocess
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import kigen  # noqa: E402
import pcbnew  # noqa: E402
import route  # noqa: E402

KICAD_APP = os.environ.get("KICAD_APP", "/Applications/KiCad/KiCad.app")
SHARED = os.path.join(KICAD_APP, "Contents", "SharedSupport")
CLI = os.path.join(KICAD_APP, "Contents", "MacOS", "kicad-cli")
NAME = "beacon-driver"
OX, OY = 100.0, 100.0          # board's top-left corner on the KiCad page (mm)
W, H = 70.0, 50.0
NC_NETS = {}   # (ref, pin) -> KiCad's "unconnected-(...)" net name, read from the schematic's netlist

# track widths (mm), from the design's layout rules
WIDE = [  # (net, width, only these pads or None)
    ("VBAT_IN", 3.0, ["J1.1", "R1.1"]),
    ("VBAT_SH", 3.0, ["R1.2", "Q11.5"]),
    ("VBAT_PROT", 2.5, ["Q11.1", "C1.1", "C2.1", "U1.4", "U1.5"]),
    ("VBAT_PROT", 1.5, ["J2.1"]),
    ("VBAT_PROT", 1.0, ["U2.1", "C3.1", "C4.1", "R15.2", "TP3.1"]),
    ("+12V", 1.0, None),
    ("+12V_INT", 0.6, None),
    ("SGND", 1.0, None),
    ("SHK_OUT", 0.6, None),
    ("SHK_JACK", 0.6, None),
    ("SIREN_SW", 0.5, None),
    ("LIGHT_SW", 0.5, None),
    ("REDLED_SW", 0.5, None),
]
SIGNAL_W = 0.25
# SMD ground pads that get their own vias down to the bottom ground plane (pads, vias each)
GND_VIAS = [(["C1.2", "C2.2", "TVS1.2", "D1.2"], 4), (["C3.2", "C4.2", "C5.2", "C7.2", "R2.2", "R20.2"], 1),
            (["Q12.2", "Q13.2", "Q14.2", "Q15.2"], 1),
            (["R4.2", "R6.2", "R8.2", "R10.2", "R13.2", "R21.2", "R22.2", "R23.2", "C8.2", "C9.2", "C11.2"], 1),
            (["TP7.1", "TP8.1"], 1)]
# module outlines (the boards that sit on U1/U2's headers), from the design's rule areas (board coords)
MODULES = {"U1": (18.77, 34.73, 33.97, 49.93, "U3V40F12 (parts up)"),
           "U2": (36.53, 17.46, 54.31, 36.51, "Adafruit 3006 amp")}
SPEAKER_PINS = (41.5, 31.0, 49.5, 35.0)   # no vias under U2's terminal-block pins
LABELS = [  # silkscreen text (x, y, size, text, justify); positions checked against the parts' outlines
    (3.0, 1.9, 1.0, "J4 12V: 1 SIREN+ 2 SIREN- 3 LIGHT+ 4 LIGHT- 5 RED+ 6 RED-", "left"),
    (3.0, 3.6, 1.0, "J5: 1 GND 2 GREEN LED+ 3 OK 4 HELP 5 SILENCE", "left"),
    (12.5, 5.4, 1.0, "J3: wires 1-7 LilyGO P1, 8-14 P2", "left"),
    (2.2, 16.2, 1.0, "J5 NOT BATT", "left"),
    (69.5, 40.0, 1.0, "BATTERY ONLY", "right"),
    (61.4, 46.6, 1.2, "+", "center"),
    (61.4, 42.6, 1.2, "-", "center"),
    (59.6, 37.7, 1.0, "LILYGO BATT", "right"),
    (61.0, 35.6, 1.2, "+", "center"),
    (65.6, 35.6, 1.2, "-", "center"),
    (2.2, 44.3, 1.0, "SHAKER", "left"),
    (7.4, 48.7, 1.0, "TIP", "center"),
    (3.2, 48.7, 1.0, "SLV", "center"),
    (34.6, 49.0, 1.0, "Help-First driver r1", "left"),
]


MODULE_FP = {  # project footprints: the maker's header row plus the module board's outline as the courtyard
    "Pololu_U3V40F12_Flat": ("PinHeader_1x06_P2.54mm_Vertical", "U1", ["OUT", "GND", "GND", "VIN", "VIN", "EN"]),
    "Adafruit_3006_MAX98357A": ("PinHeader_1x07_P2.54mm_Vertical", "U2", ["Vin", "GND", "SD", "GAIN", "DIN", "BCLK", "LRC"]),
}


def make_module_footprints(design):
    """Write beacon.pretty: each module footprint is the maker's pin header whose courtyard/fab/silk outline is the
    module board. Outlines come from MODULES (board coordinates at the design's placement), turned back into footprint
    coordinates. Written as text (KiCad's SWIG FootprintSave isn't usable headless here)."""
    import math
    lib = os.path.join(HERE, "beacon.pretty")
    os.makedirs(lib, exist_ok=True)
    place = {c["ref"]: c for c in design["components"]}
    Q = kigen.Q
    for name, (base, ref, labels) in MODULE_FP.items():
        src = os.path.join(SHARED, "footprints", "Connector_PinHeader_2.54mm.pretty", base + ".kicad_mod")
        tree = kigen.parse(open(src).read())[0]
        keep = []
        for item in tree:
            if isinstance(item, list) and item and item[0] in ("fp_line", "fp_rect", "fp_text", "fp_poly", "fp_arc"):
                layer = kigen.find(item, "layer")
                if layer and layer[1] in ("F.CrtYd", "F.SilkS", "F.Fab"):
                    continue
            keep.append(item)
        tree = keep
        tree[1] = Q(name)
        c = place[ref]
        x0, y0, x1, y1, label = MODULES[ref]
        ax, ay, th = c["x"], c["y"], math.radians(c["rot"])

        def local(bx, by):
            dx, dy = bx - ax, by - ay
            return (dx * math.cos(th) - dy * math.sin(th), dx * math.sin(th) + dy * math.cos(th))
        pts = [local(x, y) for (x, y) in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
        lx0, lx1 = round(min(q[0] for q in pts), 3), round(max(q[0] for q in pts), 3)
        ly0, ly1 = round(min(q[1] for q in pts), 3), round(max(q[1] for q in pts), 3)
        graphics = []
        for layer, w in (("F.CrtYd", 0.05), ("F.Fab", 0.1), ("F.SilkS", 0.12)):
            graphics.append(["fp_rect", ["start", lx0, ly0], ["end", lx1, ly1],
                             ["stroke", ["width", w], ["type", "solid"]], ["fill", "no"], ["layer", Q(layer)],
                             ["uuid", kigen.stable_uuid("fp", name, layer)]])
        side = -1 if lx0 < -2 else 1
        for k, lab in enumerate(labels):   # pin names beside the header, inside the module outline
            graphics.append(["fp_text", "user", Q(lab), ["at", 2.2 * side, round(k * 2.54, 3), 0], ["layer", Q("F.SilkS")],
                             ["uuid", kigen.stable_uuid("fp", name, "pin", str(k))],
                             ["effects", ["font", ["size", 1.0, 1.0], ["thickness", 0.16]],
                              ["justify", "right" if side < 0 else "left"]]])
        graphics.append(["fp_text", "user", Q(label), ["at", round((lx0 + lx1) / 2, 3), round((ly0 + ly1) / 2, 3), 90],
                         ["layer", Q("F.Fab")], ["uuid", kigen.stable_uuid("fp", name, "label")],
                         ["effects", ["font", ["size", 1, 1], ["thickness", 0.15]]]])
        pad_at = [i for i, it in enumerate(tree) if isinstance(it, list) and it and it[0] == "pad"][0]
        tree = tree[:pad_at] + graphics + tree[pad_at:]
        for it in tree:
            if isinstance(it, list) and it and it[0] == "descr":
                it[1] = Q("%s on its own straight header; the outline is the module board (courtyard)" % label)
        with open(os.path.join(lib, name + ".kicad_mod"), "w") as f:
            f.write(kigen.dump(tree) + "\n")


def fp_dir(lib):
    return os.path.join(HERE, "beacon.pretty") if lib == "beacon" else os.path.join(SHARED, "footprints", lib + ".pretty")


def lib_tables(components):
    syms = sorted({c["symbol"].split(":")[0] for c in components})
    fps = sorted({c["footprint"].split(":")[0] for c in components})
    with open(os.path.join(HERE, "sym-lib-table"), "w") as f:
        f.write("(sym_lib_table\n  (version 7)\n")
        for s in syms:
            f.write('  (lib (name "%s")(type "KiCad")(uri "${KICAD10_SYMBOL_DIR}/%s.kicad_sym")(options "")(descr ""))\n'
                    % (s, s))
        f.write(")\n")
    with open(os.path.join(HERE, "fp-lib-table"), "w") as f:
        f.write("(fp_lib_table\n  (version 7)\n")
        for s in fps:
            uri = "${KIPRJMOD}/beacon.pretty" if s == "beacon" else "${KICAD10_FOOTPRINT_DIR}/%s.pretty" % s
            f.write('  (lib (name "%s")(type "KiCad")(uri "%s")(options "")(descr ""))\n' % (s, uri))
        f.write(")\n")


def write_rules():
    """JLCPCB-safe design rules (conservative; above JLCPCB's published 2-layer minimums)."""
    with open(os.path.join(HERE, NAME + ".kicad_dru"), "w") as f:
        f.write("""(version 1)
(rule "JLCPCB clearance" (constraint clearance (min 0.2mm)))
(rule "JLCPCB track" (constraint track_width (min 0.2mm)))
(rule "JLCPCB via" (constraint via_diameter (min 0.6mm)) (constraint hole_size (min 0.3mm)))
(rule "JLCPCB annular ring" (constraint annular_width (min 0.15mm)))
(rule "JLCPCB hole to hole" (constraint hole_to_hole (min 0.25mm)))
(rule "copper to edge" (constraint edge_clearance (min 0.5mm)))
(rule "silk text" (layer "F.SilkS") (constraint text_height (min 1.0mm)) (constraint text_thickness (min 0.15mm)))
""")


def schematic(design, libs):
    comps = []
    for c in design["components"]:
        comps.append({"ref": c["ref"], "value": c["value"], "symbol": c["symbol"], "footprint": c["footprint"],
                      "in_bom": c["jlcpcb"], "pins": c["pins"],
                      "fields": {k: v for k, v in (("LCSC", c["lcsc"]), ("MPN", c["mpn"])) if v}})
    notes = ["Help-First beacon driver board, spin 1 (generated by build.py from design.json; see DESIGN.md).",
             "Pin plan #46: siren GPIO21, shaker GPIO18, strip 46, red light 14, BCLK 47, LRC 48, DIN 45, buttons 17/16, "
             "green LED 43, silence 0. High-side shaker #47. Silence button #48.",
             "Nets are joined by name (labels). Not in the BOM: U1/U2 modules, J2/J6 wire pads, test points, fiducials."]
    return kigen.write_schematic(os.path.join(HERE, NAME + ".kicad_sch"), NAME, "Help-First beacon driver board r1",
                                 comps, libs, cols=10, cell_w=55.88, cell_h=50.8, origin=(25.4, 35.56), notes=notes,
                                 paper="A2"), comps


def text(board, x, y, size, s, justify="left", layer=pcbnew.F_SilkS):
    t = pcbnew.PCB_TEXT(board)
    t.SetText(s)
    t.SetPosition(kigen.pt(OX + x, OY + y))
    t.SetTextSize(pcbnew.VECTOR2I(pcbnew.FromMM(size), pcbnew.FromMM(size)))
    t.SetTextThickness(pcbnew.FromMM(max(0.16, size * 0.16)))
    t.SetLayer(layer)
    t.SetHorizJustify({"left": pcbnew.GR_TEXT_H_ALIGN_LEFT, "right": pcbnew.GR_TEXT_H_ALIGN_RIGHT,
                       "center": pcbnew.GR_TEXT_H_ALIGN_CENTER}[justify])
    t.SetVertJustify(pcbnew.GR_TEXT_V_ALIGN_CENTER)
    board.Add(t)


def rect_on(board, layer, x0, y0, x1, y1, w=0.12, parent=None):
    for (a, b, c, d) in ((x0, y0, x1, y0), (x1, y0, x1, y1), (x1, y1, x0, y1), (x0, y1, x0, y0)):
        s = pcbnew.PCB_SHAPE(parent if parent is not None else board)
        s.SetShape(pcbnew.SHAPE_T_SEGMENT)
        s.SetLayer(layer)
        s.SetStart(kigen.pt(OX + a, OY + b))
        s.SetEnd(kigen.pt(OX + c, OY + d))
        s.SetWidth(pcbnew.FromMM(w))
        (parent if parent is not None else board).Add(s)


def board(design, sym_uuids):
    b = pcbnew.BOARD()
    ds = b.GetDesignSettings()
    ds.SetCopperLayerCount(2)
    ds.SetBoardThickness(pcbnew.FromMM(1.6))
    ds.SetAuxOrigin(kigen.pt(OX, OY + H))   # drill/place origin: the board's bottom-left corner
    ds.m_MinResolvedSpokes = 1               # small SMD pads may join the ground pour with one thermal spoke
    nets = {}

    def net(name):
        n = "/" + name
        if n not in nets:
            ni = pcbnew.NETINFO_ITEM(b, n)
            b.Add(ni)
            nets[n] = ni
        return nets[n]

    for c in design["components"]:
        lib, name = c["footprint"].split(":")
        fp = pcbnew.FootprintLoad(fp_dir(lib), name)
        fp.SetFPID(pcbnew.LIB_ID(lib, name))
        fp.SetReference(c["ref"])
        fp.SetValue(c["value"])
        for k, v in (("LCSC", c["lcsc"]), ("MPN", c["mpn"])):
            if v:
                fp.SetField(k, v)
                fld = fp.GetField(k)      # data only: keep it off the silkscreen
                fld.SetVisible(False)
                fld.SetLayer(pcbnew.F_Fab)
        fp.Value().SetLayer(pcbnew.F_Fab)
        fp.Value().SetVisible(False)
        fp.SetPosition(kigen.pt(OX + c["x"], OY + c["y"]))
        fp.SetOrientationDegrees(c["rot"])
        fp.SetPath(pcbnew.KIID_PATH("/" + sym_uuids[c["ref"]]))
        fp.SetSheetname("/")
        fp.SetSheetfile(NAME + ".kicad_sch")
        if not c["jlcpcb"]:
            fp.SetExcludedFromBOM(True)
            fp.SetExcludedFromPosFiles(True)
        b.Add(fp)
        for p in fp.Pads():
            if p.GetNumber() in c["pins"]:
                p.SetNet(net(c["pins"][p.GetNumber()]))
            elif (c["ref"], p.GetNumber()) in NC_NETS:
                n = NC_NETS[(c["ref"], p.GetNumber())]
                if n not in nets:
                    nets[n] = pcbnew.NETINFO_ITEM(b, n)
                    b.Add(nets[n])
                p.SetNet(nets[n])
        # reference designators go on the fab layer (assembly drawing), not the silkscreen; the silkscreen gets the
        # connector and module labels below, which are the ones a builder needs
        ref = fp.Reference()
        ref.SetLayer(pcbnew.F_Fab)
        ref.SetTextSize(pcbnew.VECTOR2I(pcbnew.FromMM(0.8), pcbnew.FromMM(0.8)))
        ref.SetTextThickness(pcbnew.FromMM(0.12))
    rect_on(b, pcbnew.Edge_Cuts, 0, 0, W, H, 0.1)
    for (x, y, size, s, just) in LABELS:
        text(b, x, y, size, s, just)
    # no vias under the amp's speaker-terminal pins
    z = pcbnew.ZONE(b)
    z.SetIsRuleArea(True)
    z.SetDoNotAllowVias(True)
    z.SetDoNotAllowTracks(False)
    z.SetDoNotAllowPads(False)
    z.SetDoNotAllowZoneFills(False)
    z.SetDoNotAllowFootprints(False)
    z.SetLayerSet(pcbnew.LSET.AllCuMask())
    ol = z.Outline()
    ol.NewOutline()
    x0, y0, x1, y1 = SPEAKER_PINS
    for (x, y) in ((x0, y0), (x1, y0), (x1, y1), (x0, y1)):
        ol.Append(pcbnew.FromMM(OX + x), pcbnew.FromMM(OY + y))
    b.Add(z)
    return b


def fet_fanouts(b):
    """Join each PowerPAK P-FET's three source pins with a short comb outside the package, so the wide power track can
    attach at pin 1 and nothing wide comes near the gate pin (the pins are 0.66 mm apart with 0.26 mm gaps)."""
    for ref, netname in (("Q11", "/VBAT_PROT"), ("Q16", "/+12V")):
        fp = b.FindFootprintByReference(ref)
        pads = {p.GetNumber(): p for p in fp.Pads()}
        cy = {n: pcbnew.ToMM(pads[n].GetPosition().y) for n in ("1", "2", "3")}
        cx = pcbnew.ToMM(pads["1"].GetPosition().x)
        bbx = pads["1"].GetBoundingBox()
        left = pcbnew.ToMM(bbx.GetX()) < pcbnew.ToMM(pads["5"].GetPosition().x)   # source pins on the left?
        bar_x = (pcbnew.ToMM(bbx.GetX()) - 0.45) if left else (pcbnew.ToMM(bbx.GetRight()) + 0.45)
        route.track(b, netname, [(bar_x, cy["1"]), (bar_x, cy["3"])], 0.45)
        for n in ("1", "2", "3"):
            route.track(b, netname, [(bar_x, cy[n]), (cx, cy[n])], 0.4)


def kelvin_sense(b):
    """TP1/TP2 read the shunt from the inner edge of each R1 pad (under R1's body), on their own thin traces, so the
    reading isn't the force current's drop along the wide copper."""
    r1 = b.FindFootprintByReference("R1")
    pads = {p.GetNumber(): p for p in r1.Pads()}
    for num, tp, xoff in (("1", "TP1", -0.6), ("2", "TP2", 0.6)):
        pad = pads[num]
        bb = pad.GetBoundingBox()
        cy = pcbnew.ToMM(pad.GetPosition().y)
        inner = pcbnew.ToMM(bb.GetX()) + 0.1 if xoff < 0 else pcbnew.ToMM(bb.GetRight()) - 0.1
        gap_x = inner + xoff
        tpp = b.FindFootprintByReference(tp).Pads()[0].GetPosition()
        tx, ty = pcbnew.ToMM(tpp.x), pcbnew.ToMM(tpp.y)
        route.track(b, pad.GetNetname(), [(inner, cy), (gap_x, cy), (gap_x, ty + 1.0), (tx, ty)], 0.25)


def do_route(b):
    fet_fanouts(b)
    r = route.Router(b, pitch=0.2, clearance=0.27, edge_clear=0.55)   # 0.07 mm over DRC's 0.2 for grid rounding
    x0, y0, x1, y1 = SPEAKER_PINS
    r.via_keepouts.append((OX + x0, OY + y0, OX + x1, OY + y1))
    done = set()
    for (n, w, only) in WIDE:
        ok = r.route_net("/" + n, w, only=only, use_existing=n not in ("VBAT_IN", "VBAT_SH"))
        if not ok and w > 2.0:   # fall back one step if the wide track can't get through
            r.failed = [f for f in r.failed if f[0] != "/" + n]
            ok = r.route_net("/" + n, w - 0.5, only=only, use_existing=n not in ("VBAT_IN", "VBAT_SH"))
            w -= 0.5
        done.add(n)
        print("  route %-10s %.2f mm %s" % (n, w, "ok" if ok else "FAILED"))
        if n == "VBAT_SH":
            kelvin_sense(b)
    for pads, k in GND_VIAS:   # ground vias before the signals, so every ground pad still has room for one
        route.via_stubs(r, "/GND", pads, width=0.6, per_pad=k)
    names = sorted({p.GetNetname() for fp in b.GetFootprints() for p in fp.Pads() if p.GetNetname()})
    for n in names:
        short = n.lstrip("/")
        if short in done or short == "GND":
            continue
        ok = r.route_net(n, SIGNAL_W)
        if not ok:
            print("  route %-10s FAILED" % short)
    route.stitch(r, "/GND", spacing=5.0, margin=2.0)
    return r


def tp_labels(b):
    """Name every test pad on the silkscreen ("TP3"), in the first nearby spot that clears all pads, part outlines
    (courtyards), other silk text and the board edge."""
    def box_mm(bb, grow=0.0):
        return (pcbnew.ToMM(bb.GetX()) - grow, pcbnew.ToMM(bb.GetY()) - grow,
                pcbnew.ToMM(bb.GetRight()) + grow, pcbnew.ToMM(bb.GetBottom()) + grow)

    def hit(a, c):
        return not (a[2] <= c[0] or c[2] <= a[0] or a[3] <= c[1] or c[3] <= a[1])
    blocked = []
    for fp in b.GetFootprints():
        for pad in fp.Pads():
            blocked.append(box_mm(pad.GetBoundingBox(), 0.2))
        for item in fp.GraphicalItems():
            if item.GetLayer() == pcbnew.F_CrtYd and not fp.GetReference().startswith("TP"):
                blocked.append(box_mm(item.GetBoundingBox(), 0.05))
            elif item.GetLayer() == pcbnew.F_SilkS:
                blocked.append(box_mm(item.GetBoundingBox(), 0.2))
    for d in b.GetDrawings():
        if d.GetLayer() == pcbnew.F_SilkS:
            blocked.append(box_mm(d.GetBoundingBox(), 0.2))
    edge = (OX + 0.4, OY + 0.4, OX + W - 0.4, OY + H - 0.4)
    tp_centres = [(pcbnew.ToMM(f.Pads()[0].GetPosition().x), pcbnew.ToMM(f.Pads()[0].GetPosition().y))
                  for f in b.GetFootprints() if f.GetReference().startswith("TP")]
    missing = []
    for fp in sorted(b.GetFootprints(), key=lambda f: f.GetReference()):
        ref = fp.GetReference()
        if not ref.startswith("TP") and ref not in ("J3", "J4"):
            continue
        c = fp.Pads()[0].GetPosition()
        cx, cy = pcbnew.ToMM(c.x), pcbnew.ToMM(c.y)
        placed = False
        import math
        rings = [(0, -1.75), (0, 1.75), (2.4, 0), (-2.4, 0)] + [
            (round(r * math.cos(math.radians(a)), 2), round(r * math.sin(math.radians(a)), 2))
            for r in (1.8, 2.2, 2.6, 3.0, 3.4, 3.8, 4.4) for a in range(0, 360, 20)]
        if ref in ("J3", "J4"):   # connectors: search around pin 1 a little further out
            rings = [(dx * 1.4, dy * 1.4) for (dx, dy) in rings]
        for (dx, dy) in rings:
            t = pcbnew.PCB_TEXT(b)
            t.SetText(ref)
            t.SetLayer(pcbnew.F_SilkS)
            t.SetTextSize(pcbnew.VECTOR2I(pcbnew.FromMM(1.0), pcbnew.FromMM(1.0)))
            t.SetTextThickness(pcbnew.FromMM(0.16))
            t.SetHorizJustify(pcbnew.GR_TEXT_H_ALIGN_CENTER)
            t.SetVertJustify(pcbnew.GR_TEXT_V_ALIGN_CENTER)
            t.SetPosition(kigen.pt(cx + dx, cy + dy))
            bb = box_mm(t.GetBoundingBox(), 0.0)
            if bb[0] < edge[0] or bb[1] < edge[1] or bb[2] > edge[2] or bb[3] > edge[3]:
                continue
            if any(hit(bb, k) for k in blocked):
                continue
            tcx, tcy = (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2
            own = (tcx - cx) ** 2 + (tcy - cy) ** 2
            if any((tcx - ox) ** 2 + (tcy - oy) ** 2 < own for (ox, oy) in tp_centres if (ox, oy) != (cx, cy)):
                continue   # the label would read as the neighbouring pad's
            b.Add(t)
            blocked.append(box_mm(t.GetBoundingBox(), 0.2))
            placed = True
            break
        if not placed:
            missing.append(ref)
    if missing:
        print("  no silk room for:", ", ".join(missing), "(named on the assembly drawing)")


def zones(b):
    for layer, prio in ((pcbnew.B_Cu, 0), (pcbnew.F_Cu, 0)):
        route.add_zone(b, "/GND", layer, OX + 0.3, OY + 0.3, OX + W - 0.3, OY + H - 0.3, clearance=0.25,
                       min_w=0.25, thermal_gap=0.3, spoke=0.5, priority=prio)
    route.fill_zones(b)


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True)
    out = "\n".join(l for l in (p.stdout + p.stderr).splitlines() if "Fontconfig" not in l)
    return p.returncode, out


def exports(design):
    out = os.path.join(HERE, "jlcpcb")
    gerb = os.path.join(out, "gerbers")
    if os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(gerb)
    pcb = os.path.join(HERE, NAME + ".kicad_pcb")
    run([CLI, "pcb", "export", "gerbers", "--layers", "F.Cu,B.Cu,F.Paste,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts",
         "--subtract-soldermask", "--no-x2", "--use-drill-file-origin", "-o", gerb + "/", pcb])
    run([CLI, "pcb", "export", "drill", "--format", "excellon", "--drill-origin", "plot", "--excellon-units", "mm",
         "--excellon-separate-th", "-o", gerb + "/", pcb])
    check_drill_alignment(gerb)
    with zipfile.ZipFile(os.path.join(out, NAME + "-gerbers.zip"), "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(os.listdir(gerb)):
            z.write(os.path.join(gerb, f), f)
    # pick and place (CPL) in JLCPCB's columns, front side only
    pos = os.path.join(out, "pos.csv")
    run([CLI, "pcb", "export", "pos", "--side", "front", "--format", "csv", "--units", "mm", "--exclude-dnp",
         "--use-drill-file-origin", "-o", pos, pcb])
    rows = list(csv.DictReader(open(pos)))
    with open(os.path.join(out, NAME + "-cpl.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Designator", "Mid X", "Mid Y", "Layer", "Rotation"])
        for r in rows:
            # the drill/place origin is the board's bottom-left corner, so these are board coordinates (y up)
            w.writerow([r["Ref"], "%.3fmm" % float(r["PosX"]), "%.3fmm" % float(r["PosY"]), "Top", r["Rot"]])
    os.remove(pos)
    # BOM in JLCPCB's columns: Comment, Designator, Footprint, LCSC Part #
    groups = {}
    for c in design["components"]:
        if not c["jlcpcb"]:
            continue
        key = (c["lcsc"], c["footprint"].split(":")[1])
        val = c["value"].split(" (")[0]
        g = groups.setdefault(key, {"vals": set(), "refs": []})
        g["vals"].add(val)
        g["refs"].append(c["ref"])

    def refkey(r):
        stem = r.rstrip("0123456789")
        return (stem, int(r[len(stem):] or 0))
    with open(os.path.join(out, NAME + "-bom.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Comment", "Designator", "Footprint", "LCSC Part #"])
        for (lcsc, foot), g in sorted(groups.items(), key=lambda kv: refkey(sorted(kv[1]["refs"], key=refkey)[0])):
            w.writerow([min(g["vals"], key=len), ",".join(sorted(g["refs"], key=refkey)), foot, lcsc])


def check_drill_alignment(gerb):
    """Fail loudly if the drill file and the copper Gerber don't share an origin (every hole must sit on a pad/via)."""
    import re
    files = os.listdir(gerb)
    drl = [f for f in files if f.endswith("-PTH.drl")][0]
    gtl = [f for f in files if f.endswith("F_Cu.gtl")][0]
    holes = []
    for line in open(os.path.join(gerb, drl)):
        m = re.match(r"X(-?[0-9.]+)Y(-?[0-9.]+)", line.strip())
        if m:
            holes.append((float(m.group(1)), float(m.group(2))))
    fmt = open(os.path.join(gerb, gtl)).read()
    dec = int(re.search(r"%FSLAX(\d)(\d)Y", fmt).group(2))
    flashes = set()
    for m in re.finditer(r"X(-?\d+)Y(-?\d+)D03", fmt):
        flashes.add((round(int(m.group(1)) / 10 ** dec, 2), round(int(m.group(2)) / 10 ** dec, 2)))
    off = [h for h in holes if (round(h[0], 2), round(h[1], 2)) not in flashes]
    print("  drill check: %d plated holes, %d not on a top-copper flash" % (len(holes), len(off)))
    if off:
        raise SystemExit("drill file and Gerbers disagree, e.g. hole at %s" % (off[0],))


def pictures():
    pcb = os.path.join(HERE, NAME + ".kicad_pcb")
    pics = os.path.join(HERE, "pictures")
    os.makedirs(pics, exist_ok=True)
    for side in ("top", "bottom"):
        run([CLI, "pcb", "render", "--side", side, "--quality", "basic", "--width", "1400", "--height", "1000",
             "--background", "opaque", "-o", os.path.join(pics, "board-%s.png" % side), pcb])
    run([CLI, "pcb", "export", "pdf", "--layers", "F.Fab,F.SilkS,Edge.Cuts", "--mode-single", "--black-and-white",
         "-o", os.path.join(HERE, NAME + "-assembly.pdf"), pcb])
    run([CLI, "sch", "export", "pdf", "-o", os.path.join(HERE, NAME + "-schematic.pdf"),
         os.path.join(HERE, NAME + ".kicad_sch")])


def main():
    design = json.load(open(os.path.join(HERE, "design.json")))
    j1 = [c for c in design["components"] if c["ref"] == "J1"][0]
    # Adafruit packs put + on JST circuit 1 = KiCad pad 1 (Adafruit/SparkFun Eagle libraries number these mirror-image)
    assert j1["pins"] == {"1": "VBAT_IN", "2": "GND"}, "J1 must be pad 1 = pack +, pad 2 = GND (DESIGN.md fix 13)"
    libs = kigen.SymbolLibs(os.path.join(SHARED, "symbols"))
    make_module_footprints(design)
    lib_tables(design["components"])
    write_rules()
    pro = os.path.join(HERE, NAME + ".kicad_pro")
    # project settings: silk near the board edge is cosmetic (connectors overhang the edge and JLCPCB clips silk
    # there), so DRC ignores that one; everything else keeps KiCad's default severity
    with open(pro, "w") as f:
        json.dump({"board": {"design_settings": {"rule_severities": {"silk_edge_clearance": "ignore"}}},
                   "meta": {"filename": NAME + ".kicad_pro", "version": 3}}, f, indent=2)
    sym_uuids, _ = schematic(design, libs)
    sch = os.path.join(HERE, NAME + ".kicad_sch")
    run([CLI, "sch", "upgrade", sch])
    netfile = os.path.join(HERE, NAME + ".net")
    run([CLI, "sch", "export", "netlist", "-o", netfile, sch])
    for n in kigen.find_all(kigen.find(kigen.parse(open(netfile).read())[0], "nets"), "net"):
        nm_ = kigen.find(n, "name")[1]
        if nm_.startswith("unconnected-"):
            for node in kigen.find_all(n, "node"):
                NC_NETS[(kigen.find(node, "ref")[1], kigen.find(node, "pin")[1])] = nm_
    os.remove(netfile)
    b = board(design, sym_uuids)
    print("routing ...")
    r = do_route(b)
    tp_labels(b)
    zones(b)
    b.Save(os.path.join(HERE, NAME + ".kicad_pcb"))
    if r.failed:
        print("ROUTING FAILED:", r.failed)
    rc_erc, out = run([CLI, "sch", "erc", "--exit-code-violations", "-o", os.path.join(HERE, "erc.rpt"), sch])
    print("ERC:", out.strip().splitlines()[0] if out.strip() else "", "(exit %d)" % rc_erc)
    rc_drc, out = run([CLI, "pcb", "drc", "--schematic-parity", "--refill-zones", "--severity-error",
                       "--exit-code-violations", "-o", os.path.join(HERE, "drc.rpt"),
                       os.path.join(HERE, NAME + ".kicad_pcb")])
    print("DRC errors:", " | ".join(out.strip().splitlines()[:3]), "(exit %d)" % rc_drc)
    _, outw = run([CLI, "pcb", "drc", "--schematic-parity", "--severity-warning", "-o",
                   os.path.join(HERE, "drc-warnings.rpt"), os.path.join(HERE, NAME + ".kicad_pcb")])
    print("DRC warnings:", " | ".join(outw.strip().splitlines()[:1]))
    exports(design)
    pictures()
    return 0 if (rc_erc == 0 and rc_drc == 0) else 1   # DRC's unconnected-items check covers any routing gap


if __name__ == "__main__":
    sys.exit(main())
