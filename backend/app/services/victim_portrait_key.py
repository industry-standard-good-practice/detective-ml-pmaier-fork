"""
Maps victim hidden evidence to examination "portrait" keys (body regions + room).
Environmental clues each get a dedicated scene portrait: ENVSCENE_<sanitizedEvidenceId>.
"""
import re

ENV_SCENE_PORTRAIT_PREFIX = "ENVSCENE_"


def environment_scene_portrait_key(evidence_id: str) -> str:
    """Stable portrait / storage key for one environmental hidden-evidence beat."""
    safe = re.sub(r"[^a-zA-Z0-9_-]", "_", evidence_id)
    return f"{ENV_SCENE_PORTRAIT_PREFIX}{safe}"


def infer_victim_portrait_key_for_evidence(ev: dict) -> str:
    if ev.get("discoveryContext") == "environment":
        return environment_scene_portrait_key(ev.get("id", ""))

    text = " ".join(filter(None, [ev.get("location"), ev.get("title"), ev.get("description")])).lower()

    if re.search(
        r"\b(head|face|faces|facial|scalp|hair|ear|ears|mouth|lip|lips|nose|temple|temples|jaw|chin|cheek|cheeks|brow|brows|throat)\b",
        text,
    ):
        return "HEAD"
    if re.search(
        r"\b(hand|hands|finger|fingers|fingertip|nail|nails|palm|palms|wrist|wrists|knuckle|glove|gloves)\b",
        text,
    ):
        return "HANDS"
    if re.search(
        r"\b(leg|legs|foot|feet|shoe|shoes|shoelace|sock|socks|ankle|ankles|knee|knees|thigh|cuff|hem|sole|toe|toes)\b",
        text,
    ):
        return "LEGS"

    return "TORSO"
