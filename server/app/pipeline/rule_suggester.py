"""RuleSuggester — LLM предлагает правила группировки для неразмеченных сообщений.

Идея: у пользователя копятся уведомления, которые классификатор не отнёс ни к зоне,
ни к проекту, ни к тегам. Мы агрегируем их по приложению-источнику (с примерами) и
просим LLM предложить набор ДЕТЕРМИНИРОВАННЫХ правил (match по source_app/regex →
action: теги/важность/зона), чтобы новые такие сообщения группировались автоматически
уже без LLM. Предложения показываются пользователю на ревью (не применяются молча).
"""
from __future__ import annotations

import logging

from app.config import Settings
from app.pipeline.llm_provider import LLMProvider, parse_json_object

logger = logging.getLogger(__name__)

_SYSTEM = """Ты помогаешь навести порядок в потоке пуш-уведомлений. Тебе дают список
приложений-источников с примерами НЕРАЗМЕЧЕННЫХ уведомлений (система не смогла их
категоризировать). Предложи набор ПРАВИЛ, которые будут автоматически группировать
такие уведомления в будущем — детерминированно, без LLM.

Каждое правило:
  match  — условия (все И): {"source_app": "<пакет>", "title_regex": "<regex|null>", "text_regex": "<regex|null>"}
  action — что навесить: {"add_tags": ["<тег>", ...], "set_importance": <0-100|null>}

Правила:
- Опирайся в первую очередь на source_app; regex добавляй только если внутри одного
  приложения есть чёткие подтипы (напр. "оплата" vs "реклама").
- Теги — короткие, в нижнем регистре, осмысленные (напр. "банк","доставка","реклама","соцсети").
- Рекламу/промо помечай низкой важностью (5-15), важное личное — выше.
- Не выдумывай приложения, которых нет во входных данных.

Ответ — СТРОГО JSON-массив объектов:
[{"name":"<короткое имя>","match":{...},"action":{...},"rationale":"<зачем, 1 фраза>"}]"""


class RuleSuggester:
    def __init__(self, llm: LLMProvider, settings: Settings) -> None:
        self._llm = llm
        self._s = settings

    def _model(self) -> str:
        provider = (self._s.llm_provider or "").lower()
        return self._s.ollama_model_hard if provider == "ollama" else self._s.llm_model_hard

    async def suggest(self, aggregates: list[dict], known_areas: list[dict]) -> list[dict]:
        """aggregates: [{source_app, app_label, count, samples:[str]}]. Возвращает список правил."""
        if not aggregates:
            return []

        lines = []
        for a in aggregates:
            samples = "; ".join(s for s in a.get("samples", []) if s)[:600]
            lines.append(
                f"- {a.get('app_label') or a.get('source_app')} (source_app={a.get('source_app')}, "
                f"кол-во={a.get('count')}): примеры: {samples}"
            )
        areas = "\n".join(f"  - {ar.get('id')}: {ar.get('name')}" for ar in known_areas) or "  (нет)"
        prompt = (
            f"ЗОНЫ ПОЛЬЗОВАТЕЛЯ (для справки, можно не использовать):\n{areas}\n\n"
            f"НЕРАЗМЕЧЕННЫЕ УВЕДОМЛЕНИЯ ПО ПРИЛОЖЕНИЯМ:\n" + "\n".join(lines) + "\n"
        )

        try:
            text = await self._llm.complete(
                model=self._model(), system=_SYSTEM, prompt=prompt, max_tokens=2048
            )
        except Exception:
            logger.exception("LLM-предложение правил не удалось")
            return []

        data = _parse_json_array(text)
        # Нормализуем: только известные поля match/action.
        result = []
        for r in data:
            if not isinstance(r, dict):
                continue
            match = r.get("match") or {}
            action = r.get("action") or {}
            norm_match = {
                k: match[k]
                for k in ("source_app", "title_regex", "text_regex", "category")
                if match.get(k) not in (None, "", "null")
            }
            if not norm_match:
                continue  # пустой match бесполезен
            tags = [str(t).lower() for t in (action.get("add_tags") or []) if t][:5]
            norm_action = {"add_tags": tags}
            imp = action.get("set_importance")
            if isinstance(imp, (int, float)):
                norm_action["set_importance"] = max(0, min(100, int(imp)))
            result.append(
                {
                    "name": str(r.get("name") or "rule")[:80],
                    "match": norm_match,
                    "action": norm_action,
                    "rationale": (str(r.get("rationale")) if r.get("rationale") else None),
                }
            )
        return result


def _parse_json_array(text: str) -> list:
    """Достать JSON-массив из ответа модели (терпимо к обёрткам)."""
    obj = parse_json_object(text) if text.strip().startswith("{") else None
    if isinstance(obj, dict) and "rules" in obj:
        return obj["rules"] if isinstance(obj["rules"], list) else []
    import json

    t = text.strip()
    if t.startswith("```"):
        t = t.split("```", 2)[1] if t.count("```") >= 2 else t.strip("`")
        if t.lstrip().startswith("json"):
            t = t.lstrip()[4:]
    start, end = t.find("["), t.rfind("]")
    if start != -1 and end != -1 and end > start:
        try:
            arr = json.loads(t[start : end + 1])
            return arr if isinstance(arr, list) else []
        except json.JSONDecodeError:
            return []
    return []
