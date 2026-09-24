"""One-to-one motion and appearance association for camera-local person tracks."""
import math
import cv2
import numpy as np
from scipy.optimize import linear_sum_assignment


def iou(a, b):
    intersection = max(0, min(a[2], b[2])-max(a[0], b[0])) * max(0, min(a[3], b[3])-max(a[1], b[1]))
    union = (a[2]-a[0])*(a[3]-a[1]) + (b[2]-b[0])*(b[3]-b[1]) - intersection
    return intersection/union if union > 0 else 0


def appearance(frame, box):
    height, width = frame.shape[:2]
    x1, y1, x2, y2 = box
    # Central torso region reduces background changes and occlusion at box edges.
    x1, x2 = x1 + .2*(x2-x1), x2 - .2*(x2-x1)
    y1, y2 = y1 + .2*(y2-y1), y2 - .2*(y2-y1)
    crop = frame[max(0, int(y1)):min(height, int(y2)), max(0, int(x1)):min(width, int(x2))]
    if not crop.size:
        return None
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    hist = cv2.calcHist([hsv], [0, 1], None, [18, 8], [0, 180, 0, 256])
    return cv2.normalize(hist, None, norm_type=cv2.NORM_L1)


def associate(tracks, boxes, features, now):
    keys = sorted(tracks)
    if not keys or not boxes:
        return {}
    cost = np.full((len(keys), len(boxes)), 1000., dtype=np.float64)
    for row, key in enumerate(keys):
        track = tracks[key]
        age = max(0, now-track['seen'])
        old = np.asarray(track['bbox'], dtype=float)
        predicted = old + np.asarray(track['velocity']) * min(age, .75)
        for col, box in enumerate(boxes):
            width, height = box[2]-box[0], box[3]-box[1]
            old_width, old_height = old[2]-old[0], old[3]-old[1]
            if not (.4 <= width/max(1, old_width) <= 2.5 and .4 <= height/max(1, old_height) <= 2.5):
                continue
            distance = math.hypot((box[0]+box[2]-predicted[0]-predicted[2])/2,
                                  (box[1]+box[3]-predicted[1]-predicted[3])/2)
            distance /= max(1, math.hypot(old_width, old_height))
            overlap = iou(predicted, box)
            visual = cv2.compareHist(track['appearance'], features[col], cv2.HISTCMP_BHATTACHARYYA) if track['appearance'] is not None and features[col] is not None else 0.5
            # Reject implausible jumps and dissimilar, non-overlapping targets.
            if distance > min(1.4, .65 + age*.25) or (visual > .8 and overlap < .5):
                continue
            cost[row, col] = .55*(1-overlap) + .3*visual + .15*min(distance, 1)
    rows, cols = linear_sum_assignment(cost)
    return {int(col): keys[int(row)] for row, col in zip(rows, cols) if cost[row, col] < .85}
