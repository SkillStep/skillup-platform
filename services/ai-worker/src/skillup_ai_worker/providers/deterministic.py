"""Deterministic offline adapter for CI, development, and evaluation fixtures."""

from __future__ import annotations

import json

from ..contracts import ProviderRequest, ProviderResponse, TaskName


_OUTPUTS = {
    TaskName.GENERATE_LEVEL: {
        "title": "Reviewed practice level",
        "objective": "Apply the supplied learning outcome.",
        "introduction": "Use the source material to complete both challenges.",
        "challenges": [
            {
                "type": "short_answer",
                "prompt": "State the key idea from the source material.",
                "answer": "The key idea stated in the source material.",
                "explanation": "This answer stays grounded in the supplied source.",
            },
            {
                "type": "multiple_choice",
                "prompt": "Choose the option that matches the source material.",
                "answer": "The source-aligned option.",
                "explanation": "The selected option directly matches the reviewed source.",
            },
        ],
        "completion_summary": "You applied the reviewed learning outcome.",
    },
    TaskName.GENERATE_DISTRACTORS: {
        "distractors": ["Incorrect option A", "Incorrect option B", "Incorrect option C"],
        "rationale": "Each distractor is distinct and intentionally incorrect.",
    },
    TaskName.GENERATE_EXPLANATION: {
        "explanation": "Compare the response with the reviewed expected answer.",
        "misconception": "The response may have missed a source-backed distinction.",
        "next_step": "Review the source and try the challenge again.",
    },
    TaskName.SUMMARIZE: {
        "summary": "A concise summary grounded in the supplied material.",
        "key_points": ["First reviewed point", "Second reviewed point"],
    },
    TaskName.DIFFICULTY_CLASSIFICATION: {
        "level": "beginner",
        "confidence": 0.9,
        "rationale": "The fixture uses one direct concept and a clear rubric.",
    },
    TaskName.TRANSLATE_CONTENT: {
        "translated_text": "Deterministic translated fixture text.",
        "glossary_applied": [],
        "reviewer_notes": "Human language review remains required before publication.",
    },
    TaskName.QUALITY_REVIEW: {
        "verdict": "revise",
        "score": 80,
        "issues": ["Deterministic fixture requires human review."],
        "required_changes": ["Confirm accuracy against the approved source."],
    },
}


class DeterministicAdapter:
    def generate(self, request: ProviderRequest) -> ProviderResponse:
        content = json.dumps(_OUTPUTS[request.task], ensure_ascii=False, sort_keys=True)
        return ProviderResponse(
            content=content,
            input_tokens=sum(len(message.content) for message in request.messages) // 4,
            output_tokens=max(1, len(content) // 4),
            provider_request_id=f"deterministic:{request.task.value}",
        )
