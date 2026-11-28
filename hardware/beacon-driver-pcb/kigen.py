"""Small helpers to write a KiCad schematic from a netlist, and to build a KiCad board with pcbnew.

Runs under the Python that ships inside KiCad (3.9 on macOS), so keep it 3.9-compatible.

The schematic style is "label-based": every symbol sits on a grid, and each pin gets a short wire and a net label. It
is plain to read, and KiCad's ERC and netlist export treat the labels as real connections. The board is built with
KiCad's own pcbnew API, with every footprint linked to its schematic symbol so DRC's schematic-parity check can
compare the two.
"""
import math
import os
import uuid as uuidlib

# ----------------------------------------------------------------------------------------------------------------
# S-expressions
# ----------------------------------------------------------------------------------------------------------------


class Q(str):
    """A quoted string in an S-expression (an unquoted atom is a plain str)."""


def parse(text):
    """Parse KiCad's S-expression text into nested lists of str / Q."""
    pos, n = 0, len(text)
    stack = [[]]
    while pos < n:
        c = text[pos]
        if c in " \t\r\n":
            pos += 1
        elif c == "(":
            stack.append([])
            pos += 1
        elif c == ")":
            done = stack.pop()
            stack[-1].append(done)
            pos += 1
        elif c == '"':
            pos += 1
            out = []
            while text[pos] != '"':
                if text[pos] == "\\":
                    nxt = text[pos + 1]
                    out.append({"n": "\n", "t": "\t", '"': '"', "\\": "\\"}.get(nxt, nxt))
                    pos += 2
                else:
                    out.append(text[pos])
                    pos += 1
            stack[-1].append(Q("".join(out)))
            pos += 1
        else:
            start = pos
            while pos < n and text[pos] not in " \t\r\n()":
                pos += 1
            stack[-1].append(text[start:pos])
    return stack[0]


def _atom(a):
    if isinstance(a, Q):
        return '"' + a.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n") + '"'
    if isinstance(a, float):
        s = ("%.4f" % a).rstrip("0").rstrip(".")
        return "0" if s in ("-0", "") else s
    return str(a)


def dump(node, indent=0):
    """Serialise nested lists back to KiCad-style text."""
    if not isinstance(node, list):
        return _atom(node)
    simple = all(not isinstance(x, list) for x in node)
    if simple:
        return "(" + " ".join(_atom(x) for x in node) + ")"
    tab = "\t" * (indent + 1)
    parts = []
    head = []
    for x in node:
        if isinstance(x, list):
            break
        head.append(_atom(x))
    rest = node[len(head):]
    s = "(" + " ".join(head)
    for x in rest:
        s += "\n" + tab + dump(x, indent + 1)
    return s + "\n" + "\t" * indent + ")"


def find(node, key):
    """First child list whose head is key."""
    for x in node:
        if isinstance(x, list) and x and x[0] == key:
            return x
    return None


def find_all(node, key):
    return [x for x in node if isinstance(x, list) and x and x[0] == key]


def new_uuid():
    return Q(str(uuidlib.uuid4()))


def stable_uuid(*names):
    """A UUID that stays the same between runs, so regenerated files diff cleanly."""
    return Q(str(uuidlib.uuid5(uuidlib.NAMESPACE_URL, "prosefire-beacon-driver/" + "/".join(names))))


# ----------------------------------------------------------------------------------------------------------------
# Symbol libraries
# ----------------------------------------------------------------------------------------------------------------


class SymbolLibs:
    def __init__(self, symbol_dir):
        self.dir = symbol_dir
        self.cache = {}

    def _lib(self, lib):
        if lib not in self.cache:
            path = os.path.join(self.dir, lib + ".kicad_sym")
            with open(path) as f:
                tree = parse(f.read())[0]
            self.cache[lib] = {x[1]: x for x in find_all(tree, "symbol")}
        return self.cache[lib]

    def flattened(self, lib_id):
        """The symbol definition for 'Lib:Name', with any 'extends' resolved, named for embedding."""
        lib, name = lib_id.split(":", 1)
        syms = self._lib(lib)
        if name not in syms:
            raise KeyError("symbol %s not found in %s" % (name, lib))
        sym = syms[name]
        ext = find(sym, "extends")
        if ext is None:
            out = _deepcopy(sym)
        else:
            base = self.flattened(lib + ":" + ext[1])
            base_name = ext[1]
            out = [x for x in _deepcopy(base) if not (isinstance(x, list) and x and x[0] == "property")]
            # derived properties replace the base ones
            props = [_deepcopy(p) for p in find_all(sym, "property")]
            idx = 2
            for p in props:
                out.insert(idx, p)
                idx += 1
            for x in out:
                if isinstance(x, list) and x and x[0] == "symbol" and isinstance(x[1], str):
                    x[1] = Q(x[1].replace(base_name.split(":")[-1] + "_", name + "_", 1))
        out[1] = Q(lib_id)
        return out

    def pins(self, lib_id):
        """{number: (x, y, angle, length, type)} in library coordinates (y up), for unit 1 / body style 1."""
        sym = self.flattened(lib_id)
        pins = {}
        for sub in find_all(sym, "symbol"):
            parts = str(sub[1]).rsplit("_", 2)
            unit = int(parts[-2]) if len(parts) >= 3 and parts[-2].isdigit() else 0
            style = int(parts[-1]) if parts[-1].isdigit() else 1
            if unit not in (0, 1) or style not in (0, 1):
                continue
            for p in find_all(sub, "pin"):
                at = find(p, "at")
                num = find(p, "number")[1]
                length = float(find(p, "length")[1])
                pins[str(num)] = (float(at[1]), float(at[2]), float(at[3]) if len(at) > 3 else 0.0, length, p[1])
        return pins


def _deepcopy(x):
    if isinstance(x, list):
        return [_deepcopy(y) for y in x]
    return x


# ----------------------------------------------------------------------------------------------------------------
# Schematic writer
# ----------------------------------------------------------------------------------------------------------------

GRID = 1.27


def snap(v):
    return round(round(v / GRID) * GRID, 4)


def _effects(size=1.27, hide=False, justify=None):
    e = ["effects", ["font", ["size", size, size]]]
    if justify:
        e.append(["justify"] + justify.split())
    if hide:
        e.append(["hide", "yes"])
    return e


def _prop(name, value, x, y, angle=0, hide=False, justify=None):
    return ["property", Q(name), Q(value), ["at", x, y, angle], _effects(hide=hide, justify=justify)]


def write_schematic(path, project, title, components, libs, cols=6, cell_w=55.88, cell_h=40.64, origin=(25.4, 30.48),
                    notes=(), paper="A3"):
    """components: list of dicts with ref, value, symbol ('Lib:Name'), footprint, fields (dict), pins ({pin: net}).

    Returns {ref: symbol_uuid} so the board can link each footprint to its symbol."""
    root = stable_uuid(project, "root")
    used = {}
    for c in components:
        used.setdefault(c["symbol"], libs.flattened(c["symbol"]))
    body = [
        "kicad_sch",
        ["version", "20231120"],
        ["generator", Q("prosefire_kigen")],
        ["generator_version", Q("8.0")],
        ["uuid", root],
        ["paper", Q(paper)],
        ["title_block", ["title", Q(title)], ["company", Q("ProseFire (placeholder name)")],
         ["comment", 1, Q("Generated by hardware/beacon-driver-pcb/build.py from design.json: edit those, not this file")]],
        ["lib_symbols"] + list(used.values()),
    ]
    sym_uuids = {}
    for i, c in enumerate(components):
        col, row = i % cols, i // cols
        X = snap(origin[0] + col * cell_w)
        Y = snap(origin[1] + row * cell_h)
        su = stable_uuid(project, "sym", c["ref"])
        sym_uuids[c["ref"]] = str(su)
        pins = libs.pins(c["symbol"])
        top = min([-p[1] for p in pins.values()] + [-2.54])
        props = [
            _prop("Reference", c["ref"], X + 2.54, snap(Y + top - 3.81), justify="left"),
            _prop("Value", c["value"], X + 2.54, snap(Y + top - 1.27), justify="left"),
            _prop("Footprint", c["footprint"], X, Y, hide=True),
            _prop("Datasheet", c.get("datasheet", "~"), X, Y, hide=True),
        ]
        for k, v in c.get("fields", {}).items():
            props.append(_prop(k, v, X, Y, hide=True))
        inst = ["symbol", ["lib_id", Q(c["symbol"])], ["at", X, Y, 0], ["unit", 1],
                ["exclude_from_sim", "no"], ["in_bom", "yes" if c.get("in_bom", True) else "no"], ["on_board", "yes"],
                ["dnp", "no"], ["uuid", su]] + props
        for num in pins:
            inst.append(["pin", Q(num), ["uuid", stable_uuid(project, "pin", c["ref"], num)]])
        inst.append(["instances", ["project", Q(project), ["path", Q("/" + str(root)), ["reference", Q(c["ref"])],
                                                           ["unit", 1]]]])
        body.append(inst)
        # wires + labels (or no-connect flags) at each pin
        for num, (px, py, ang, length, ptype) in pins.items():
            sx, sy = snap(X + px), snap(Y - py)
            net = c["pins"].get(num)
            if net is None:
                body.append(["no_connect", ["at", sx, sy], ["uuid", stable_uuid(project, "nc", c["ref"], num)]])
                continue
            out = (ang + 180) % 360
            dx, dy = round(math.cos(math.radians(out))), -round(math.sin(math.radians(out)))
            ex, ey = snap(sx + dx * 2.54), snap(sy + dy * 2.54)
            body.append(["wire", ["pts", ["xy", sx, sy], ["xy", ex, ey]], ["stroke", ["width", 0], ["type", "default"]],
                         ["uuid", stable_uuid(project, "w", c["ref"], num)]])
            if dx > 0:
                la, just = 0, "left bottom"
            elif dx < 0:
                la, just = 180, "right bottom"
            elif dy < 0:
                la, just = 90, "left bottom"
            else:
                la, just = 270, "right bottom"
            body.append(["label", Q(net), ["at", ex, ey, la], _effects(justify=just),
                         ["uuid", stable_uuid(project, "l", c["ref"], num)]])
    y = 15.0
    for k, t in enumerate(notes):
        body.append(["text", Q(t), ["exclude_from_sim", "no"], ["at", 25.4, snap(y + k * 3.81), 0],
                     _effects(size=1.524, justify="left bottom"), ["uuid", stable_uuid(project, "note", str(k))]])
    body.append(["sheet_instances", ["path", Q("/"), ["page", Q("1")]]])
    with open(path, "w") as f:
        f.write(dump(body) + "\n")
    return sym_uuids


# ----------------------------------------------------------------------------------------------------------------
# Board helpers (pcbnew)
# ----------------------------------------------------------------------------------------------------------------


def mm(v):
    import pcbnew
    return pcbnew.FromMM(v)


def pt(x, y):
    import pcbnew
    return pcbnew.VECTOR2I(pcbnew.FromMM(x), pcbnew.FromMM(y))
