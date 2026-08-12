"""Tests for the bot_manager module-discovery logic."""

from __future__ import annotations

from src.bots.registry import BOTS_BY_KEY, BotPhase
from src.core.bot_manager import _module_candidates


class TestModuleCandidates:
    def test_flat_path_first(self) -> None:
        defn = BOTS_BY_KEY["guest"]
        candidates = _module_candidates(defn)
        assert candidates[0] == "src.bots.guest"

    def test_phase1_path_included(self) -> None:
        defn = BOTS_BY_KEY["guest"]
        candidates = _module_candidates(defn)
        assert "src.bots.phase1.guest" in candidates

    def test_phase2_bot_gets_phase2_dir(self) -> None:
        defn = BOTS_BY_KEY["birthday"]
        assert defn.phase == BotPhase.PHASE_2
        candidates = _module_candidates(defn)
        assert "src.bots.phase2.birthday" in candidates

    def test_branch_bot_gets_branch_dir(self) -> None:
        defn = BOTS_BY_KEY["br_chilonzor"]
        candidates = _module_candidates(defn)
        assert "src.bots.branch.br_chilonzor" in candidates

    def test_concept_bot_gets_concept_dir(self) -> None:
        defn = BOTS_BY_KEY["concept_pizza"]
        candidates = _module_candidates(defn)
        assert "src.bots.concept.concept_pizza" in candidates

    def test_ai_bot_gets_ai_dir(self) -> None:
        defn = BOTS_BY_KEY["menu_ai"]
        candidates = _module_candidates(defn)
        assert "src.bots.ai.menu_ai" in candidates

    def test_phase1_bot_does_not_get_phase2_dir(self) -> None:
        defn = BOTS_BY_KEY["guest"]
        candidates = _module_candidates(defn)
        assert "src.bots.phase2.guest" not in candidates
