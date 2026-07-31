"""SkillUp provider-neutral AI worker."""

from .contracts import AiJob, AiResult, ProviderName, TaskName
from .gateway import AiGateway

__all__ = ["AiGateway", "AiJob", "AiResult", "ProviderName", "TaskName", "__version__"]
__version__ = "1.0.0"
