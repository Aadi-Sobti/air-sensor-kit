"""PNG previews of the housing (matplotlib only), so the design can be checked without a slicer."""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from mpl_toolkits.mplot3d.art3d import Poly3DCollection  # noqa: E402


def _tris(m):
    mesh = m.to_mesh()
    v = np.asarray(mesh.vert_properties)[:, :3]
    return v[np.asarray(mesh.tri_verts)]


def _shade(tris, base, light=(0.4, -0.6, 0.8)):
    n = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0])
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    k = 0.45 + 0.55 * np.clip(n @ (np.array(light) / np.linalg.norm(light)), 0, 1)
    return np.clip(np.outer(k, base), 0, 1)


def _visible(tris, elev, azim):
    """Back-face culling so matplotlib's painter's algorithm doesn't draw hidden faces on top."""
    e, a = np.radians(elev), np.radians(azim)
    view = np.array([np.cos(e) * np.cos(a), np.cos(e) * np.sin(a), np.sin(e)])
    n = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0])
    return tris[n @ view > 0]


def _draw(ax, items, elev, azim, title):
    items = [(_visible(t, elev, azim), c, a) for t, c, a in items]
    lo = np.min([t.reshape(-1, 3).min(0) for t, _, _ in items], axis=0)
    hi = np.max([t.reshape(-1, 3).max(0) for t, _, _ in items], axis=0)
    for tris, color, alpha in items:
        pc = Poly3DCollection(tris, facecolors=_shade(tris, color), edgecolors="none", alpha=alpha)
        ax.add_collection3d(pc)
    c, r = (lo + hi) / 2, (hi - lo).max() / 2
    ax.set_xlim(c[0] - r, c[0] + r)
    ax.set_ylim(c[1] - r, c[1] + r)
    ax.set_zlim(c[2] - r, c[2] + r)
    ax.set_box_aspect((1, 1, 1))
    ax.view_init(elev=elev, azim=azim)
    ax.set_axis_off()
    ax.set_title(title, fontsize=10)


def render(insert, shell, ghosts, out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    ins, sh = _tris(insert), _tris(shell)
    gcol = {"PMS5003": np.array([0.35, 0.55, 0.85]), "NodeMCU": np.array([0.25, 0.6, 0.35]),
            "jumpers": np.array([0.85, 0.2, 0.6]), "USB plug": np.array([0.3, 0.3, 0.3])}
    gt = [(_tris(m), gcol[k], 0.75) for k, m in ghosts.items()]
    white, orange = np.array([0.92, 0.92, 0.9]), np.array([0.95, 0.55, 0.15])

    fig = plt.figure(figsize=(14, 10), dpi=110)
    _draw(fig.add_subplot(221, projection="3d"), [(sh, white, 1)], 22, -60, "Shell (front, roof on top)")
    _draw(fig.add_subplot(222, projection="3d"), [(sh, white, 1)], -35, -60, "Shell from below (open skirt, divider)")
    _draw(fig.add_subplot(223, projection="3d"), [(ins, orange, 1)] + gt, 30, -55,
          "Insert + parts: PMS5003 blue, board green, jumpers pink, USB plug grey")
    _draw(fig.add_subplot(224, projection="3d"), [(ins, orange, 1)], 55, -110, "Insert alone")
    fig.tight_layout()
    fig.savefig(out / "overview.png")
    plt.close(fig)

    # cross-sections: through the PMS (side view) and through the board (front view)
    fig, axs = plt.subplots(1, 2, figsize=(14, 6), dpi=110)
    cuts = (("x", 45.0, "Side cut at x = 45 mm through the PMS and board (front is left)", "y (mm)"),
            ("y", 46.0, "Front cut through the board and USB plug at y = 46 mm", "x (mm)"))
    for ax, (axis, at, title, xlabel) in zip(axs, cuts):
        cols = {"PMS5003": "#5a8cd8", "NodeMCU": "#3f9a5a", "jumpers": "#d63399", "USB plug": "#555555"}
        for m, col in [(shell, "#bbbbbb"), (insert, "#f0903a")] + [(g, cols[k]) for k, g in ghosts.items()]:
            if axis == "x":  # rotate so x becomes z: section coords are (-z, y)
                polys = m.rotate([0, -90, 0]).slice(at).to_polygons()
                pts = [np.column_stack([np.asarray(q)[:, 1], -np.asarray(q)[:, 0]]) for q in polys]
            else:  # rotate so y becomes z: section coords are (x, -z)
                polys = m.rotate([90, 0, 0]).slice(at).to_polygons()
                pts = [np.column_stack([np.asarray(q)[:, 0], -np.asarray(q)[:, 1]]) for q in polys]
            for q in pts:
                ax.fill(q[:, 0], q[:, 1], color=col, alpha=0.9, lw=0)
        ax.set_aspect("equal")
        ax.set_title(title)
        ax.set_xlabel(xlabel)
        ax.set_ylabel("height (mm)")
        ax.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(out / "sections.png")
    plt.close(fig)
