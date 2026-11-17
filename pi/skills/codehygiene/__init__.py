"""1.58-bit ternary weight-space programmed System One model for code readability and hygiene."""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from functools import lru_cache
import json
import math
import os
from pathlib import Path
import sys
from typing import Any
import numpy as np

__version__ = "0.5.0"
__all__ = [
    "ARCHETYPE_NAMES", "MAX_COLS", "MAX_REL_DIST", "Result", "SCORE_NAMES",
    "SQUIGGLE_KINDS", "SQUIGGLE_MESSAGES", "Squiggle", "encode_byte_grid",
    "lint", "load_weights", "main", "render_report", "rl_reward", "score",
    "unpack_ternary_archive",
]

MAX_COLS = 128
MAX_REL_DIST = 32
_SKETCH_DIM = 40
_PRIOR_LINES = 8.0
_PEAK_WINDOW = 32
_PEAK_MIN_GATE = 10.0
_PEAK_PRIOR = 4.0
_RIBBON_GUARD = 6
_POW3 = 3 ** np.arange(5, dtype=np.uint8)

_CODE_EXTS = frozenset({
    ".py", ".pyi", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".c", ".h",
    ".cc", ".cpp", ".cxx", ".hpp", ".rs", ".go", ".zig", ".java", ".cs", ".lua",
    ".rb", ".php", ".swift", ".kt", ".scala", ".sh",
})
_SKIP_DIRS = frozenset({
    ".git", ".hg", ".svn", "__pycache__", "node_modules", "target",
    "build", "dist", "venv", ".venv", ".tox", ".mypy_cache", ".pytest_cache",
})

_SPEC = (
    ("deep_nesting", "Deep nesting; flatten with guard clauses"),
    ("poor_naming", "Over-abstracted (*Factory), cryptic short name, or magic index"),
    ("noisy_comment", "Comment restates code or leaves TODO/lint noise"),
    ("swallowed_error", "Ignored error or silent fallback value"),
    ("dense_line", "Long line, chained calls, or nested ternary"),
    ("special_casing", "Stacked hardcoded special-case branches"),
    ("duplicate_block", "Duplicated logic block"),
    ("cramped_layout", "Unbroken statement wall or inconsistent indent"),
)
SQUIGGLE_KINDS = tuple(kind for kind, _ in _SPEC)
SQUIGGLE_MESSAGES = dict(_SPEC)

SCORE_NAMES = (
    "flatness", "naming", "simplicity",
    "comments", "error_handling", "layout",
)
ARCHETYPE_NAMES = (
    "minimal", "clean", "enterprise",
    "dense", "slop",
)
_N_SCORES = len(SCORE_NAMES)
_SCORE_LOGIT_END = 2 + 4 * _N_SCORES
_STYLE_LOGIT_END = _SCORE_LOGIT_END + len(ARCHETYPE_NAMES)

_LEVELS = np.array([0.0, 1.0 / 3.0, 2.0 / 3.0, 1.0], dtype=np.float32)
_ANSI = ("\033[1m", "\033[2m", "\033[33m", "\033[36m", "\033[32m", "\033[31m", "\033[0m")


@dataclass
class Squiggle:
    line: int
    col_start: int
    col_end: int
    probability: float
    kind: str
    message: str


@dataclass
class Result:
    score: float
    rl_hygiene: float
    scores: dict[str, float]
    archetype: str
    archetype_probs: dict[str, float]
    squiggles: list[Squiggle]
    line_probs: np.ndarray

    def to_dict(self) -> dict[str, Any]:
        items = [{**asdict(sq), "probability": round(sq.probability, 4)} for sq in self.squiggles]
        return {
            "score": round(self.score, 4),
            "rl_hygiene": round(self.rl_hygiene, 4),
            "scores": {name: round(val, 4) for name, val in self.scores.items()},
            "archetype": self.archetype,
            "archetype_probs": {name: round(val, 4) for name, val in self.archetype_probs.items()},
            "squiggles": items,
        }


def _relu(arr: np.ndarray) -> np.ndarray:
    return np.maximum(arr, 0.0)


def _sigmoid(arr: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(arr, -30.0, 30.0)))


def _softmax(arr: np.ndarray) -> np.ndarray:
    shifted = np.exp(arr - np.max(arr, axis=-1, keepdims=True))
    return shifted / np.sum(shifted, axis=-1, keepdims=True)


def _l2_norm(arr: np.ndarray, eps: float = 2.5) -> np.ndarray:
    return arr / np.sqrt(np.sum(arr * arr, axis=-1, keepdims=True) + eps)


def _conv1d(cells: np.ndarray, kernel: np.ndarray, bias: np.ndarray) -> np.ndarray:
    num_lines, num_cols, _ = cells.shape
    k_size, _, out_channels = kernel.shape
    active_in = np.flatnonzero(np.any(kernel != 0, axis=(0, 2)))
    if len(active_in) == 0:
        return np.broadcast_to(bias, (num_lines, num_cols, out_channels)).copy()

    sub_cells = cells[:, :, active_in]
    sub_kern = np.ascontiguousarray(kernel[:, active_in, :])
    pad = (k_size - 1) // 2
    pad_widths = ((0, 0), (pad, k_size - 1 - pad), (0, 0))
    padded = np.pad(sub_cells, pad_widths) if k_size > 1 else sub_cells

    stride_cols = num_cols + k_size - 1
    flat_in = padded.reshape(-1, len(active_in))
    span = num_lines * stride_cols - (k_size - 1)
    flat_out = np.empty((num_lines * stride_cols, out_channels), dtype=np.float32)
    flat_out[:span] = bias
    for offset in range(k_size):
        k_slice = sub_kern[offset]
        if k_slice.any():
            flat_out[:span] += flat_in[offset : offset + span] @ k_slice
    return flat_out.reshape(num_lines, stride_cols, out_channels)[:, :num_cols, :]


def _ribbon_conv_sum(
    rib_cells: np.ndarray,
    rib_pos: np.ndarray,
    line_starts: np.ndarray,
    kernel: np.ndarray,
    bias: np.ndarray,
) -> np.ndarray:
    k_size, _, out_channels = kernel.shape
    pad = (k_size - 1) // 2
    active_in = np.flatnonzero(np.any(kernel != 0, axis=(0, 2)))
    sub_cells = np.ascontiguousarray(rib_cells[:, active_in])
    sub_kern = np.ascontiguousarray(kernel[:, active_in, :])

    valid_len = len(rib_cells) - (k_size - 1)
    conv_out = np.empty((valid_len, out_channels), dtype=np.float32)
    conv_out[:] = bias
    for offset in range(k_size):
        k_slice = sub_kern[offset]
        if k_slice.any():
            conv_out += sub_cells[offset : offset + valid_len] @ k_slice
    active_out = np.maximum(conv_out[rib_pos - pad], 0.0)
    return np.add.reduceat(active_out, line_starts, axis=0)


def _block01_active_lines(
    params: dict[str, np.ndarray],
    grid: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Run Block 0 masking and Block 1 k=3/7/13/sketch convolutions on occupied cell spans."""
    num_lines, max_width = grid.shape
    col_pos = np.arange(1, max_width + 1, dtype=np.int32)[None, :]
    row_lens = np.max(np.where(grid != 0, col_pos, 0), axis=1)
    nonblank = np.flatnonzero(row_lens > 0)

    col_sums = np.zeros((num_lines, params["col_sum_proj"].shape[1]), dtype=np.float32)
    conv3 = np.zeros((num_lines, params["conv3_w"].shape[2]), dtype=np.float32)
    conv7 = np.zeros((num_lines, params["conv7_w"].shape[2]), dtype=np.float32)
    conv13 = np.zeros((num_lines, params["conv13_w"].shape[2]), dtype=np.float32)
    raw_sketch = np.zeros((num_lines, params["sketch_w"].shape[2]), dtype=np.float32)
    if len(nonblank) == 0:
        return col_sums, conv3, conv7, conv13, raw_sketch

    span_lens = np.minimum(max_width, row_lens[nonblank] + _RIBBON_GUARD)
    line_starts = np.cumsum(span_lens) - span_lens
    total_active = int(np.sum(span_lens))
    line_ids = np.repeat(np.arange(len(nonblank), dtype=np.int32), span_lens)
    within_col = np.arange(total_active, dtype=np.int32) - line_starts[line_ids]

    codes = grid[nonblank[line_ids], within_col]
    emb_act = params["tok_emb"][codes] + params["col_emb"][within_col]

    pre_starts = np.empty(len(nonblank) + 1, dtype=np.int32)
    pre_starts[0] = 1
    np.cumsum(span_lens + 1, out=pre_starts[1:])
    pre_pos = pre_starts[:-1][line_ids] + within_col
    rib_emb = np.zeros((int(pre_starts[-1]) + 1, emb_act.shape[1]), dtype=np.float32)
    rib_emb[pre_pos] = emb_act

    pre_w = params["pre_conv3_w"]
    lex_len = len(rib_emb) - 2
    lex_rib = np.broadcast_to(params["pre_conv3_b"], (lex_len, pre_w.shape[2])).copy()
    for offset in range(3):
        lex_rib += rib_emb[offset : offset + lex_len] @ pre_w[offset]
    lex_act = np.maximum(lex_rib[pre_pos - 1], 0.0)

    has_prev = (line_starts > 0)[:, None]
    prev_idx = np.maximum(line_starts - 1, 0)
    pref1_in = np.concatenate([emb_act, lex_act], axis=-1) @ params["pref1_proj"]
    pref1_cs = np.cumsum(pref1_in, axis=0)
    pref1_base = np.where(has_prev, pref1_cs[prev_idx], 0.0)
    prefix1 = pref1_cs - pref1_base[line_ids] - pref1_in

    gate_in = np.concatenate([emb_act, lex_act, prefix1], axis=-1)
    gates = np.maximum(gate_in @ params["gate1_w"] + params["gate1_b"], 0.0)
    pref2_in = gates @ params["pref2_proj"]
    pref2_cs = np.cumsum(pref2_in, axis=0)
    pref2_base = np.where(has_prev, pref2_cs[prev_idx], 0.0)
    prefix2 = pref2_cs - pref2_base[line_ids]

    fuse_in = np.concatenate([emb_act, lex_act, gates, prefix2], axis=-1)
    cells_act = np.maximum(fuse_in @ params["col_fuse_w"] + params["col_fuse_b"], 0.0)
    col_sums[nonblank] = np.add.reduceat(cells_act, line_starts, axis=0) @ params["col_sum_proj"]

    rib_starts = np.empty(len(nonblank) + 1, dtype=np.int32)
    rib_starts[0] = _RIBBON_GUARD
    np.cumsum(span_lens + _RIBBON_GUARD, out=rib_starts[1:])
    rib_pos = rib_starts[:-1][line_ids] + within_col
    rib_cells = np.empty((int(rib_starts[-1]) + _RIBBON_GUARD, cells_act.shape[1]), dtype=np.float32)
    rib_cells[:] = np.maximum(params["col_fuse_b"], 0.0)
    rib_cells[rib_pos] = cells_act

    conv3[nonblank] = _ribbon_conv_sum(
        rib_cells, rib_pos, line_starts, params["conv3_w"], params["conv3_b"]
    )
    conv7[nonblank] = _ribbon_conv_sum(
        rib_cells, rib_pos, line_starts, params["conv7_w"], params["conv7_b"]
    )
    conv13[nonblank] = _ribbon_conv_sum(
        rib_cells, rib_pos, line_starts, params["conv13_w"], params["conv13_b"]
    )
    raw_sketch[nonblank] = _ribbon_conv_sum(
        rib_cells, rib_pos, line_starts, params["sketch_w"], params["sketch_b"]
    )
    return col_sums, conv3, conv7, conv13, raw_sketch


def _attend_banded_heads(
    q_proj: np.ndarray | None,
    k_proj: np.ndarray | None,
    v_proj: np.ndarray,
    b_rel: np.ndarray,
    b_sink: np.ndarray,
    banded: list[int],
    inv_scale: np.float32,
) -> np.ndarray:
    num_lines = v_proj.shape[1]
    val_dim = v_proj.shape[2]
    rad = MAX_REL_DIST
    win = 2 * rad + 1
    num_b = len(banded)

    q_sub = q_proj[banded] * inv_scale if q_proj is not None else None
    k_sub = k_proj[banded] if k_proj is not None else None
    v_sub = v_proj[banded]
    rel_sub = b_rel[banded]

    logits = np.full((num_b, num_lines, win + 1), -1e9, dtype=np.float32)
    logits[:, :, win] = b_sink[banded, None]
    active_offsets = [off for off in range(-rad + 1, rad) if np.any(rel_sub[:, off + rad] > -1e3)]

    for off in active_offsets:
        q_start, q_end = max(0, -off), min(num_lines, num_lines - off)
        if q_start >= q_end:
            continue
        slot = off + rad
        bias_col = rel_sub[:, slot : slot + 1]
        if q_sub is not None and k_sub is not None:
            dots = np.sum(
                q_sub[:, q_start:q_end, :] * k_sub[:, q_start + off : q_end + off, :],
                axis=-1,
            )
            logits[:, q_start:q_end, slot] = dots + bias_col
        else:
            logits[:, q_start:q_end, slot] = bias_col

    weights = _softmax(logits)
    out = np.zeros((num_b, num_lines, val_dim), dtype=np.float32)
    for off in active_offsets:
        q_start, q_end = max(0, -off), min(num_lines, num_lines - off)
        if q_start >= q_end:
            continue
        slot = off + rad
        out[:, q_start:q_end, :] += (
            weights[:, q_start:q_end, slot : slot + 1] * v_sub[:, q_start + off : q_end + off, :]
        )
    return out


def _sink_attn(
    state: np.ndarray,
    wq: np.ndarray,
    wk: np.ndarray,
    wv: np.ndarray,
    wo: np.ndarray,
    b_rel: np.ndarray,
    b_sink: np.ndarray,
) -> np.ndarray:
    """Multi-head relative-offset attention across lines with O(L) banded execution."""
    num_lines, num_heads = state.shape[0], b_sink.shape[0]
    head_dim = wq.shape[1] // num_heads
    val_dim = wv.shape[1] // num_heads

    v_proj = (state @ wv).reshape(num_lines, num_heads, val_dim).transpose(1, 0, 2)
    has_qk = bool(np.any(wq != 0) and np.any(wk != 0))
    q_proj = (state @ wq).reshape(num_lines, num_heads, head_dim).transpose(1, 0, 2) if has_qk else None
    k_proj = (state @ wk).reshape(num_lines, num_heads, head_dim).transpose(1, 0, 2) if has_qk else None
    inv_scale = np.float32(1.0 / np.sqrt(float(head_dim)))

    banded = [head for head in range(num_heads) if b_rel[head, 0] <= -1e3 and b_rel[head, -1] <= -1e3]
    global_heads = [head for head in range(num_heads) if head not in banded]
    merged = np.zeros((num_heads, num_lines, val_dim), dtype=np.float32)

    if banded:
        merged[banded] = _attend_banded_heads(
            q_proj, k_proj, v_proj, b_rel, b_sink, banded, inv_scale
        )

    for head in global_heads:
        h_slice = slice(head * head_dim, (head + 1) * head_dim)
        qh_zero = (not has_qk) or (not np.any(wq[:, h_slice] != 0))
        if qh_zero and np.all(b_rel[head] == 0.0):
            weight = np.float32(1.0 / (float(num_lines) + float(np.exp(b_sink[head]))))
            merged[head] = v_proj[head].sum(axis=0, keepdims=True) * weight
            continue
        line_idx = np.arange(num_lines)
        raw_dist = line_idx[None, :] - line_idx[:, None]
        rel_idx = np.clip(raw_dist, -MAX_REL_DIST, MAX_REL_DIST) + MAX_REL_DIST
        logits_h = b_rel[head, rel_idx].copy()
        if not qh_zero and q_proj is not None and k_proj is not None:
            logits_h += (q_proj[head] @ k_proj[head].T) * inv_scale
        sink_col = np.full((num_lines, 1), b_sink[head], dtype=np.float32)
        weights_h = _softmax(np.concatenate([logits_h, sink_col], axis=-1))[:, :num_lines]
        merged[head] = weights_h @ v_proj[head]

    return merged.transpose(1, 0, 2).reshape(num_lines, -1) @ wo


def encode_byte_grid(code: str, max_lines: int | None = None) -> tuple[np.ndarray, list[str]]:
    """Convert raw source text into a (lines, 128) uint8 grid of 7-bit ASCII codes."""
    all_lines = code.expandtabs(2).splitlines() or [""]
    lines = all_lines[:max_lines] if max_lines is not None else all_lines
    grid = np.zeros((len(lines), MAX_COLS), dtype=np.uint8)
    for row, text in enumerate(lines):
        if not text:
            continue
        clipped = text[:MAX_COLS]
        if clipped.isascii():
            ascii_codes = np.frombuffer(clipped.encode("ascii"), dtype=np.uint8)
        else:
            codepoints = np.frombuffer(clipped.encode("utf-32-le"), dtype=np.uint32)
            ascii_codes = np.minimum(codepoints, 127).astype(np.uint8)
        grid[row, : len(ascii_codes)] = np.where(ascii_codes == 0, 32, ascii_codes)
    return grid, lines


def _peak_window_density(state: np.ndarray, active_gate: np.ndarray) -> np.ndarray:
    pos_weighted = _relu(state) * active_gate
    zero_row = np.zeros((1, state.shape[1]), dtype=np.float32)
    zero_gate = np.zeros((1, 1), dtype=np.float32)
    pad_w = np.vstack([zero_row, np.cumsum(pos_weighted, axis=0)])
    pad_g = np.vstack([zero_gate, np.cumsum(active_gate, axis=0)])
    hi_idx = np.arange(1, len(state) + 1)
    lo_idx = np.maximum(0, hi_idx - _PEAK_WINDOW)
    win_gate = np.maximum(pad_g[hi_idx] - pad_g[lo_idx], _PEAK_MIN_GATE) + _PEAK_PRIOR
    return ((pad_w[hi_idx] - pad_w[lo_idx]) / win_gate).max(axis=0)


def _forward(params: dict[str, np.ndarray], grid: np.ndarray) -> tuple[np.ndarray, ...]:
    # Blocks 0 & 1: quote/comment masking + k=3/7/13 convolutions + SimHash sketches
    col_sums, conv3, conv7, conv13, raw_sketch = _block01_active_lines(params, grid)
    sketch = _relu(raw_sketch) - _relu(raw_sketch - 1.0)
    raw_feats = np.concatenate([col_sums, conv3, conv7, conv13], axis=-1)

    if "ml_proj" in params:
        ml_deltas = raw_feats @ params["ml_proj"]
        ml_excl = np.cumsum(ml_deltas, axis=0) - ml_deltas
        ml_saw = _relu(ml_excl @ params["ml_gate_w"] + params["ml_gate_b"])
        paren_suf = _relu(
            _conv1d(ml_deltas[None, :, :], params["ml_paren_w"], params["ml_paren_b"])[0]
        )
        line_feats = np.concatenate([raw_feats, ml_saw, paren_suf], axis=-1)
    else:
        line_feats = raw_feats

    line_hidden = _relu(line_feats @ params["lmlp1_w"] + params["lmlp1_b"])
    line_stats = line_hidden @ params["lmlp2_w"] + params["lmlp2_b"]
    state = np.concatenate(
        [line_stats, _l2_norm(sketch[:, :_SKETCH_DIM]), _l2_norm(sketch[:, _SKETCH_DIM:])],
        axis=-1,
    )

    # Block 2: two cross-line sink-attention + context-MLP passes over [-32..+32] offsets
    for layer in ("1", "2"):
        state = state + _sink_attn(
            state,
            params[f"attn{layer}_wq"],
            params[f"attn{layer}_wk"],
            params[f"attn{layer}_wv"],
            params[f"attn{layer}_wo"],
            params[f"attn{layer}_brel"],
            params[f"attn{layer}_bsink"],
        )
        ctx_hidden = _relu(state @ params[f"cmlp{layer}_w"] + params[f"cmlp{layer}_b"])
        state = state + ctx_hidden @ params[f"cmlp{layer}_2_w"] + params[f"cmlp{layer}_2_b"]

    # Block 3: per-line squiggle probabilities + active-line pooling into System One logits
    line_probs = _sigmoid(state @ params["sq_w"] + params["sq_b"])
    active_gate = _sigmoid(state @ params["pool_gate_w"] + params["pool_gate_b"])
    prior_lines = _PRIOR_LINES if "ml_proj" in params else 1e-5
    weighted = state * active_gate
    doc_mean = weighted.sum(axis=0) / (active_gate.sum(axis=0) + prior_lines)
    if "ml_proj" in params:
        doc_max = _peak_window_density(state, active_gate)
    else:
        doc_max = (_relu(state) * active_gate).max(axis=0)
    doc_vec = np.concatenate([doc_mean, doc_max], axis=-1)
    doc_hidden = _relu(doc_vec @ params["doc1_w"] + params["doc1_b"])
    logits = doc_hidden @ params["doc2_w"] + params["doc2_b"]

    noul_probs = _sigmoid(logits[:2])
    score_grid = logits[2:_SCORE_LOGIT_END].reshape(_N_SCORES, 4)
    subscores = (_softmax(score_grid) * _LEVELS[None, :]).sum(axis=-1)
    style_probs = _softmax(logits[_SCORE_LOGIT_END:_STYLE_LOGIT_END])
    return line_probs, noul_probs, subscores, style_probs


def unpack_ternary_archive(
    trit_buf: np.ndarray,
    vec_buf: np.ndarray,
    meta_str: str,
) -> dict[str, np.ndarray]:
    """Unpack 5-trit-per-byte {-1, 0, +1} matrices and fold 1D per-channel scales."""
    trit_part, vec_part = meta_str.split("|")
    vecs: dict[str, np.ndarray] = {}
    vec_offset = 0
    for entry in vec_part.split(" ; "):
        name, dims, count_str = entry.split(":")
        count = int(count_str)
        shape = tuple(int(dim) for dim in dims.split(","))
        vecs[name] = vec_buf[vec_offset : vec_offset + count].reshape(shape).astype(np.float32)
        vec_offset += count

    unpacked_digits = (((trit_buf[:, None] // _POW3) % 3 + 1) % 3).astype(np.int8) - 1
    flat_trits = unpacked_digits.ravel()
    params: dict[str, np.ndarray] = {}
    byte_offset = 0

    for entry in trit_part.split(" ; "):
        name, dims, packed_len_str = entry.split(":")
        packed_len = int(packed_len_str)
        shape = tuple(int(dim) for dim in dims.split(","))
        num_elems = math.prod(shape)
        trit_start = byte_offset * 5
        mat = flat_trits[trit_start : trit_start + num_elems].reshape(shape).astype(np.float32)
        byte_offset += packed_len

        scale_key = f"{name[:-2]}_s" if name.endswith("_w") else f"{name}_s"
        if name == "col_sum_proj":
            scale_key = "col_sum_s"
        if scale_key in vecs:
            mat = mat * vecs[scale_key]
        params[name] = mat

    for name, val in vecs.items():
        if not name.endswith("_s"):
            params[name] = val
    return params


@lru_cache(maxsize=2)
def load_weights(path: str | Path | None = None) -> dict[str, np.ndarray]:
    target = Path(path) if path else Path(__file__).with_name("weights.npz")
    with np.load(target) as archive:
        if "trits" in archive.files:
            return unpack_ternary_archive(
                archive["trits"], archive["vecs"], str(archive["meta"].item())
            )
        return {name: archive[name].astype(np.float32) for name in archive.files}


def score(
    code: str,
    *,
    threshold: float = 0.55,
    weights: dict[str, np.ndarray] | None = None,
) -> Result:
    grid, lines = encode_byte_grid(code)
    line_probs, heads, subscores, styles = _forward(weights or load_weights(), grid)
    squiggles: list[Squiggle] = []

    for idx, raw_line in enumerate(lines):
        best_kind = int(np.argmax(line_probs[idx]))
        prob = float(line_probs[idx, best_kind])
        if prob < threshold:
            continue
        stripped = raw_line.lstrip(" ")
        col_start = len(raw_line) - len(stripped) + 1 if stripped else 1
        kind = SQUIGGLE_KINDS[best_kind]
        squiggles.append(
            Squiggle(
                line=idx + 1,
                col_start=col_start,
                col_end=max(col_start, len(raw_line)),
                probability=prob,
                kind=kind,
                message=SQUIGGLE_MESSAGES[kind],
            )
        )

    return Result(
        score=float(heads[0]),
        rl_hygiene=float(heads[1]),
        scores=dict(zip(SCORE_NAMES, map(float, subscores))),
        archetype=ARCHETYPE_NAMES[int(np.argmax(styles))],
        archetype_probs=dict(zip(ARCHETYPE_NAMES, map(float, styles))),
        squiggles=squiggles,
        line_probs=line_probs,
    )


def lint(code: str, *, threshold: float = 0.55) -> list[Squiggle]:
    return score(code, threshold=threshold).squiggles


def rl_reward(
    code: str,
    tests_passed: bool | float = True,
    *,
    weight: float = 0.25,
    hygiene_blend: float = 0.5,
) -> float:
    gate = float(tests_passed)
    if gate <= 0.0:
        return 0.0
    res = score(code)
    blended = (1.0 - hygiene_blend) * res.score + hygiene_blend * res.rl_hygiene
    squiggle_damp = 1.0 / (1.0 + 1.5 * len(res.squiggles))
    return gate * (1.0 + weight * blended * squiggle_damp)


def render_report(
    label: str,
    src: str,
    thresh: float = 0.55,
    color: bool = True,
    res: Result | None = None,
) -> str:
    _, lines = encode_byte_grid(src)
    result = res or score(src, threshold=thresh)
    bold, dim, yel, cyan, grn, red, rst = _ANSI if color else ("",) * 7
    tone = (red, yel, grn)[int(result.score >= 0.40) + int(result.score >= 0.70)]
    style_pct = result.archetype_probs[result.archetype] * 100

    out = [
        f"{bold}{label}{rst}",
        f"  score: {tone}{result.score:.3f}{rst}  rl_hygiene: {cyan}{result.rl_hygiene:.3f}{rst}  "
        f"style: {bold}{result.archetype}{rst} ({style_pct:.0f}%)",
    ]
    for name, val in result.scores.items():
        filled = int(round(max(0.0, min(1.0, val)) * 16))
        bar = "#" * filled + "." * (16 - filled)
        out.append(f"    {name:15s} {bar} {val:.2f}")
    if not result.squiggles:
        return "\n".join([*out, f"\n  {grn}ok - no squiggles (threshold {thresh:.2f}){rst}"])

    out.append(f"\n  {yel}{len(result.squiggles)} squiggle(s):{rst}")
    for sq in result.squiggles:
        src_line = lines[sq.line - 1]
        indent_pad = " " * (sq.col_start - 1)
        wavy = "~" * max(1, min(len(src_line) - sq.col_start + 1, 72))
        tag = f"[{sq.kind} {sq.probability:.2f}]"
        out.append(f"  {dim}{sq.line:4d} |{rst} {src_line}")
        out.append(f"       {dim}|{rst} {indent_pad}{yel}{wavy} {tag}{rst} {dim}{sq.message}{rst}")
    return "\n".join(out)


def _walk_dir(root: Path) -> list[Path]:
    found: list[Path] = []
    for cur_dir, subdirs, filenames in os.walk(root):
        subdirs[:] = sorted(
            name for name in subdirs
            if not name.startswith(".") and name not in _SKIP_DIRS and not name.endswith(".egg-info")
        )
        base = Path(cur_dir)
        found.extend(
            base / fname for fname in sorted(filenames) if Path(fname).suffix.lower() in _CODE_EXTS
        )
    return found


def _expand_paths(specs: list[str]) -> list[Path]:
    expanded: list[Path] = []
    for spec in specs:
        matches = sorted(Path().glob(spec)) if any(ch in spec for ch in "*?[") else [Path(spec)]
        for path in matches:
            expanded.extend(_walk_dir(path) if path.is_dir() else [path])
    return expanded


def _load_update_module() -> Any:
    if __package__:
        from . import update_check
        return update_check
    pkg_dir = str(Path(__file__).resolve().parent)
    if pkg_dir not in sys.path:
        sys.path.insert(0, pkg_dir)
    import update_check
    return update_check


def main(argv: list[str] | None = None) -> int:
    desc = "A 13 KB, 1.58-bit ternary weight-space programmed System One model for code hygiene."
    parser = argparse.ArgumentParser(prog="codehygiene", description=desc)
    parser.add_argument("files", nargs="*", help="Files, directories, or globs (stdin if piped)")
    parser.add_argument("-t", "--threshold", type=float, default=0.55, help="Squiggle threshold")
    parser.add_argument("--check", action="store_true", help="Exit 1 when squiggles are found")
    parser.add_argument("--json", action="store_true", help="Output structured JSON")
    parser.add_argument("--no-color", action="store_true", help="Disable ANSI colors")
    parser.add_argument(
        "--no-update-check", action="store_true", help="Skip 12-hour release check"
    )
    parser.add_argument("-V", "--version", action="version", version=f"%(prog)s {__version__}")
    args = parser.parse_args(argv)

    if not args.files and sys.stdin.isatty():
        parser.print_help()
        return 0
    paths = _expand_paths(args.files)
    targets = [(path.as_posix(), path.read_text("utf-8", "replace")) for path in paths]
    if not args.files:
        targets = [("<stdin>", sys.stdin.read())]
    if not targets:
        return 0

    updater = _load_update_module()
    update_handle = updater.start_update_check(__version__, disabled=args.no_update_check)
    runs = [(label, src, score(src, threshold=args.threshold)) for label, src in targets]
    exit_code = 1 if (args.check and any(res.squiggles for _, _, res in runs)) else 0
    if args.json:
        payloads = [res.to_dict() for _, _, res in runs]
        is_single = len(payloads) == 1 and (not args.files or not Path(args.files[0]).is_dir())
        body = payloads[0] if is_single else dict(zip((lbl for lbl, _, _ in runs), payloads))
        print(json.dumps(body, indent=2))
    else:
        reports = [
            render_report(lbl, src, args.threshold, not args.no_color, res)
            for lbl, src, res in runs
        ]
        print("\n\n".join(reports))

    updater.emit_update_notice(update_handle)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
