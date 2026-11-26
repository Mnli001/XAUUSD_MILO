"""
A probability model for session breakouts: trained on 2019–2022, judged untouched on 2023 →.
Asks one thing: does scoring a breakout by all its features pick better trades than the fixed rule does?
  python scripts/breakout-model.py breakouts.csv
"""
import sys, csv, numpy as np
rows = list(csv.DictReader(open(sys.argv[1])))
FEATS = ["dScore", "h4Score", "m15Score", "stopAtr", "widthAtr", "bodyAtr", "closeLoc", "ema50Dist", "prevDayDir", "rsi", "beyondPrevDay", "atr15Rel", "oppBroken", "barsSinceRange"]
def X_of(rs):
    base = np.array([[float(r[f]) for f in FEATS] for r in rs])
    ses = np.array([[1.0 if int(r["session"]) == k else 0.0 for k in range(3)] for r in rs])
    # a few honest non-linear terms: both trends agreeing, and squared width (too narrow and too wide both differ)
    agree = ((base[:, 0] > 0) & (base[:, 1] > 0)).astype(float)[:, None]
    return np.hstack([base, ses, agree, base[:, 3:4] ** 2])
t = np.array([r["time"] for r in rows]); r_ = np.array([float(r["r"]) for r in rows]); win = (r_ > 0).astype(float)
ses = np.array([int(r["session"]) for r in rows])
X = X_of(rows)
IS = t < "2023-01-01"; OOS = ~IS
mu, sd = X[IS].mean(0), X[IS].std(0) + 1e-9
Z = (X - mu) / sd
Zb = np.hstack([Z, np.ones((len(Z), 1))])

def ridge(Zt, y, lam):
    A = Zt.T @ Zt + lam * np.eye(Zt.shape[1]); A[-1, -1] -= lam
    return np.linalg.solve(A, Zt.T @ y)
def stats(mask):
    x = r_[mask]
    if len(x) == 0: return "0 trades"
    g = x[x > 0].sum(); l = -x[x <= 0].sum(); w = (x > 0).mean() * 100
    eq = np.cumsum(x[np.argsort(t[mask])]); dd = (np.maximum.accumulate(np.maximum(eq, 0)) - eq).max()
    return f"{len(x):4d} tr  win {w:4.1f}%  avg {x.mean():+.3f}R  PF {g / l if l else 9.99:.2f}  DD {dd:.1f}R  total {x.sum():+.1f}R"

# the fixed rule, as nearly as the dataset can express it
d = {f: np.array([float(r[f]) for r in rows]) for f in FEATS}
hour = np.array([float(r["hour"]) for r in rows])
rule = (d["dScore"] > 0) & (d["h4Score"] > 0) & (d["stopAtr"] >= 0.25) & (d["oppBroken"] == 0)
weeks_oos = (np.datetime64(sorted(t)[-1][:10]) - np.datetime64("2023-01-01")).astype(int) / 7
print(f"breakouts: {IS.sum()} (2019–22), {OOS.sum()} (2023→)")
print("all breakouts      IS:", stats(IS), "| OOS:", stats(OOS))
print("the fixed rule     IS:", stats(IS & rule), "| OOS:", stats(OOS & rule))
n_rule_oos = (OOS & rule).sum()

for lam in [30, 100, 300, 1000]:
    w = ridge(Zb[IS], r_[IS], lam)
    pred = Zb @ w
    print(f"\nridge on expected R, lambda {lam}")
    for q in [0.5, 0.7, 0.8, 0.9]:
        thr = np.quantile(pred[IS], q)  # threshold fixed on the training years
        pick = pred >= thr
        print(f"  top {int((1 - q) * 100):2d}% by score  IS:", stats(IS & pick), "| OOS:", stats(OOS & pick), f"({(OOS & pick).sum() / weeks_oos:.2f}/wk)")
    if lam == 300:
        names = FEATS + ["ses0", "ses1", "ses2", "trendsAgree", "stopAtr^2", "bias"]
        order = np.argsort(-np.abs(w[:-1]))
        print("  strongest features:", ", ".join(f"{names[i]} {w[i]:+.3f}" for i in order[:8]))
        # the model as a filter on top of the rule
        for q in [0.3, 0.5]:
            thr = np.quantile(pred[IS & rule], q)
            pick = rule & (pred >= thr)
            print(f"  rule AND score above its {int(q * 100)}th pct  IS:", stats(IS & pick), "| OOS:", stats(OOS & pick), f"({(OOS & pick).sum() / weeks_oos:.2f}/wk)")

# How steady is "the rule, minus its weakest trades by score"? Several strengths and cut-offs, and each year.
print("\nRULE + SCORE FILTER, robustness")
for lam in [100, 300, 1000]:
    w = ridge(Zb[IS], r_[IS], lam); pred = Zb @ w
    for q in [0.2, 0.3, 0.4]:
        thr = np.quantile(pred[IS & rule], q); pick = rule & (pred >= thr)
        print(f"  lambda {lam:4d}, drop weakest {int(q * 100)}%  IS:", stats(IS & pick), "| OOS:", stats(OOS & pick))
# the version kept: the most regularised model, dropping the rule's weakest fifth
w = ridge(Zb[IS], r_[IS], 1000); pred = Zb @ w
thr = np.quantile(pred[IS & rule], 0.2); pick = rule & (pred >= thr)
yr = np.array([x[:4] for x in t])
print("  by year (lambda 1000, drop 20%):")
for y in sorted(set(yr)):
    print(f"    {y}  rule:", stats(rule & (yr == y)), "| filtered:", stats(pick & (yr == y)))
import json
names = FEATS + ["ses0", "ses1", "ses2", "trendsAgree", "stopAtrSq"]
json.dump({"features": names, "mean": mu.tolist(), "sd": sd.tolist(), "weights": w[:-1].tolist(), "bias": float(w[-1]), "threshold": float(thr), "trainedOn": "broker 2019-2022", "lambda": 1000}, open(sys.argv[2], "w"), indent=1) if len(sys.argv) > 2 else None

# A second file (the site's own candles) scored with the same weights and threshold: no refitting.
if len(sys.argv) > 3:
    rs2 = list(csv.DictReader(open(sys.argv[3])))
    X2 = (X_of(rs2) - mu) / sd; p2 = np.hstack([X2, np.ones((len(X2), 1))]) @ w
    r2 = np.array([float(x["r"]) for x in rs2]); t2 = np.array([x["time"] for x in rs2])
    g = {f: np.array([float(x[f]) for x in rs2]) for f in FEATS}
    rule2 = (g["dScore"] > 0) & (g["h4Score"] > 0) & (g["stopAtr"] >= 0.25) & (g["oppBroken"] == 0)
    def st2(m):
        x = r2[m]; gg = x[x > 0].sum(); l = -x[x <= 0].sum(); eq = np.cumsum(x[np.argsort(t2[m])]); dd = (np.maximum.accumulate(np.maximum(eq, 0)) - eq).max()
        return f"{len(x):4d} tr  win {(x > 0).mean() * 100:4.1f}%  avg {x.mean():+.3f}R  PF {gg / l:.2f}  DD {dd:.1f}R  total {x.sum():+.1f}R"
    print(f"SITE CANDLES ({sorted(t2)[0][:10]} → {sorted(t2)[-1][:10]}), same weights:")
    print("  the rule:", st2(rule2)); print("  filtered:", st2(rule2 & (p2 >= thr)))
    last = t2 >= sorted(t2)[-1][:4] + "-00"; yr1 = t2 >= "2025-11-26"
    print("  last 12 months, rule:", st2(rule2 & yr1), "| filtered:", st2(rule2 & yr1 & (p2 >= thr)))
