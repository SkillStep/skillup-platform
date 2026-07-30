"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import styles from "./level-player.module.css";

type Locale = "en" | "ur";

type ChallengeOption = Readonly<{
  key: string;
  label: string;
  accessibleLabel?: string | null;
}>;

type ChallengeBase = Readonly<{
  id: string;
  versionId: string;
  contentVersion: number;
  locale: Locale;
  slug: string;
  prompt: string;
  instruction?: string | null;
  points: number;
}>;

type PublicChallenge =
  | (ChallengeBase &
      Readonly<{
        type: "multiple_choice";
        options: readonly ChallengeOption[];
        selectionLimit: number;
      }>)
  | (ChallengeBase &
      Readonly<{
        type: "true_false" | "ordering" | "scenario";
        options: readonly ChallengeOption[];
      }>)
  | (ChallengeBase &
      Readonly<{
        type: "matching";
        left: readonly ChallengeOption[];
        right: readonly ChallengeOption[];
      }>)
  | (ChallengeBase &
      Readonly<{
        type: "fill_blank";
        placeholder: string;
        maxLength: number;
      }>)
  | (ChallengeBase &
      Readonly<{
        type: "short_response";
        placeholder: string;
        maxLength: number;
        evaluationNotice: string;
      }>);

type GameplaySession = Readonly<{
  id: string;
  levelId: string;
  levelVersionId: string;
  state: "active" | "completed" | "abandoned" | "expired";
  currentChallengeOrdinal: number;
  awardedPoints: number;
  maxPoints: number;
  attemptsUsed: number;
  maxAttempts: number;
  startedAt: string;
  expiresAt: string;
  currentChallenge: PublicChallenge | null;
}>;

type ChallengeResult = Readonly<{
  challengeId: string;
  challengeVersionId: string;
  status: "correct" | "incorrect" | "needs_review";
  awardedPoints: number;
  maxPoints: number;
  explanation: string;
  retryAllowed: boolean;
  attemptNumber: number;
  evaluatedAt: string;
}>;

type ChallengeResponse =
  | Readonly<{ type: "multiple_choice" | "scenario"; selectedOptionKeys: string[] }>
  | Readonly<{ type: "true_false"; selectedOptionKey: string }>
  | Readonly<{ type: "ordering"; orderedOptionKeys: string[] }>
  | Readonly<{
      type: "matching";
      matches: Array<Readonly<{ leftKey: string; rightKey: string }>>;
    }>
  | Readonly<{ type: "fill_blank" | "short_response"; value: string }>;

type SubmissionPayload = Readonly<{
  challengeId: string;
  challengeVersionId: string;
  idempotencyKey: string;
  response: ChallengeResponse;
}>;

type SubmissionResponse = Readonly<{
  result: ChallengeResult;
  session: GameplaySession;
}>;

type LevelPlayerProps = Readonly<{
  levelId: string;
  locale: Locale;
}>;

async function readApiMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === "string" && body.message.length > 0) return body.message;
  } catch {
    // The response may not contain JSON.
  }
  return "The request could not be completed. Please try again.";
}

function challengeTypeLabel(type: PublicChallenge["type"]): string {
  switch (type) {
    case "multiple_choice":
      return "Choose answer";
    case "true_false":
      return "True or false";
    case "ordering":
      return "Put in order";
    case "matching":
      return "Match items";
    case "scenario":
      return "Scenario";
    case "fill_blank":
      return "Fill the blank";
    case "short_response":
      return "Short response";
  }
}

function feedbackTitle(result: ChallengeResult): string {
  if (result.status === "correct") return "Correct";
  if (result.status === "needs_review") return "Saved for review";
  if (result.retryAllowed) return "Not quite — try again";
  return "Review this explanation";
}

export function LevelPlayer({ levelId, locale }: LevelPlayerProps) {
  const storageKey = `skillup:level-session:${levelId}`;
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<GameplaySession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [systemMessage, setSystemMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ChallengeResult | null>(null);
  const [pendingSubmission, setPendingSubmission] = useState<SubmissionPayload | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [orderedKeys, setOrderedKeys] = useState<string[]>([]);
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [textValue, setTextValue] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function startSession(): Promise<GameplaySession | null> {
      const response = await fetch(`/api/v1/gameplay/levels/${levelId}/sessions`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale }),
        signal: controller.signal,
      });
      if (response.status === 401) {
        window.location.replace(`/${locale}/sign-in`);
        return null;
      }
      if (!response.ok) throw new Error(await readApiMessage(response));
      return (await response.json()) as GameplaySession;
    }

    async function restoreSession(sessionId: string): Promise<GameplaySession | null> {
      const response = await fetch(`/api/v1/gameplay/sessions/${sessionId}`, {
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.status === 401) {
        window.location.replace(`/${locale}/sign-in`);
        return null;
      }
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(await readApiMessage(response));
      return (await response.json()) as GameplaySession;
    }

    async function initialise() {
      try {
        const savedSessionId = window.sessionStorage.getItem(storageKey);
        let loadedSession = savedSessionId ? await restoreSession(savedSessionId) : null;
        if (!loadedSession) {
          window.sessionStorage.removeItem(storageKey);
          loadedSession = await startSession();
        }
        if (!loadedSession) return;

        window.sessionStorage.setItem(storageKey, loadedSession.id);
        setSession(loadedSession);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setSystemMessage(
            error instanceof Error ? error.message : "The level could not be loaded.",
          );
        }
      } finally {
        setLoading(false);
      }
    }

    void initialise();
    return () => controller.abort();
  }, [levelId, locale, storageKey]);

  const challenge = session?.currentChallenge ?? null;
  useEffect(() => {
    setSelectedKeys([]);
    setMatches({});
    setTextValue("");
    if (challenge?.type === "ordering") {
      setOrderedKeys(challenge.options.map((option) => option.key));
    } else {
      setOrderedKeys([]);
    }
  }, [challenge]);

  useEffect(() => {
    if (feedback) feedbackRef.current?.focus();
  }, [feedback]);

  useEffect(() => {
    if (session?.state === "completed" && feedback === null) {
      window.sessionStorage.removeItem(storageKey);
    }
  }, [feedback, session?.state, storageKey]);

  const selectedRightKeys = useMemo(() => new Set(Object.values(matches)), [matches]);

  const canSubmit = useMemo(() => {
    if (!challenge || busy || feedback !== null) return false;
    switch (challenge.type) {
      case "multiple_choice":
      case "scenario":
        return selectedKeys.length > 0;
      case "true_false":
        return selectedKeys.length === 1;
      case "ordering":
        return orderedKeys.length === challenge.options.length;
      case "matching":
        return challenge.left.every((option) => Boolean(matches[option.key]));
      case "fill_blank":
      case "short_response":
        return textValue.trim().length > 0;
    }
  }, [busy, challenge, feedback, matches, orderedKeys, selectedKeys, textValue]);

  function buildResponse(current: PublicChallenge): ChallengeResponse {
    switch (current.type) {
      case "multiple_choice":
        return { type: current.type, selectedOptionKeys: selectedKeys };
      case "scenario":
        return { type: current.type, selectedOptionKeys: selectedKeys };
      case "true_false":
        return { type: current.type, selectedOptionKey: selectedKeys[0] ?? "" };
      case "ordering":
        return { type: current.type, orderedOptionKeys: orderedKeys };
      case "matching":
        return {
          type: current.type,
          matches: current.left.map((option) => ({
            leftKey: option.key,
            rightKey: matches[option.key] ?? "",
          })),
        };
      case "fill_blank":
      case "short_response":
        return { type: current.type, value: textValue };
    }
  }

  async function sendSubmission(payload: SubmissionPayload) {
    if (!session) return;
    setBusy(true);
    setSystemMessage(null);

    try {
      const response = await fetch(`/api/v1/gameplay/sessions/${session.id}/submissions`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.status === 401) {
        window.location.replace(`/${locale}/sign-in`);
        return;
      }
      if (!response.ok) {
        setPendingSubmission(null);
        setSystemMessage(await readApiMessage(response));
        return;
      }

      const body = (await response.json()) as SubmissionResponse;
      window.sessionStorage.setItem(storageKey, body.session.id);
      setPendingSubmission(null);
      setSession(body.session);
      setFeedback(body.result);
    } catch {
      setPendingSubmission(payload);
      setSystemMessage(
        "Your answer may not have reached SkillUp. Retry safely without changing your answer.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge || !canSubmit) return;
    const payload: SubmissionPayload = {
      challengeId: challenge.id,
      challengeVersionId: challenge.versionId,
      idempotencyKey: window.crypto.randomUUID(),
      response: buildResponse(challenge),
    };
    await sendSubmission(payload);
  }

  function toggleOption(key: string, checked: boolean, selectionLimit: number) {
    setSelectedKeys((current) => {
      if (!checked) return current.filter((candidate) => candidate !== key);
      if (selectionLimit === 1) return [key];
      if (current.includes(key) || current.length >= selectionLimit) return current;
      return [...current, key];
    });
  }

  function moveOrder(index: number, direction: -1 | 1) {
    setOrderedKeys((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const selected = next[index];
      const displaced = next[nextIndex];
      if (!selected || !displaced) return current;
      next[index] = displaced;
      next[nextIndex] = selected;
      return next;
    });
  }

  function continueAfterFeedback() {
    setFeedback(null);
    setSystemMessage(null);
  }

  if (loading) {
    return (
      <section className={styles["player"]} aria-live="polite">
        <div className={styles["loading"]}>
          <h1>Preparing your level…</h1>
          <p>SkillUp is restoring your exact challenge and saved progress.</p>
        </div>
      </section>
    );
  }

  if (!session) {
    return (
      <section className={styles["player"]}>
        <div className={styles["loading"]}>
          <h1>This level is unavailable</h1>
          <p>{systemMessage ?? "The level could not be opened safely."}</p>
          <Link className={styles["homeButton"]} href={`/${locale}`}>
            Return home
          </Link>
        </div>
      </section>
    );
  }

  const scoreProgress =
    session.maxPoints > 0
      ? Math.min(100, Math.round((session.awardedPoints / session.maxPoints) * 100))
      : 0;

  if (session.state === "completed" && feedback === null) {
    return (
      <section className={styles["player"]}>
        <div className={styles["completion"]}>
          <p>Level complete</p>
          <h1>You finished this practice level.</h1>
          <div
            className={styles["score"]}
            aria-label={`${session.awardedPoints} out of ${session.maxPoints} points`}
          >
            {session.awardedPoints}/{session.maxPoints}
          </div>
          <p>Your result is saved against this exact published level version.</p>
          <Link className={styles["homeButton"]} href={`/${locale}`}>
            Return to SkillUp
          </Link>
        </div>
      </section>
    );
  }

  if (session.state === "expired" || session.state === "abandoned") {
    return (
      <section className={styles["player"]}>
        <div className={styles["loading"]}>
          <h1>This session has ended</h1>
          <p>
            Your completed attempts remain saved. Start the level again from the SkillUp home page.
          </p>
          <Link className={styles["homeButton"]} href={`/${locale}`}>
            Return home
          </Link>
        </div>
      </section>
    );
  }

  if (!challenge && feedback === null) {
    return (
      <section className={styles["player"]}>
        <div className={styles["loading"]}>
          <h1>No challenge is available</h1>
          <p>The server could not resolve a published challenge for this session.</p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles["player"]} aria-labelledby="challenge-title">
      <div className={styles["statusBar"]}>
        <span className={styles["statusLabel"]}>
          Challenge {session.currentChallengeOrdinal + 1}
        </span>
        <span
          className={styles["progressTrack"]}
          role="progressbar"
          aria-label="Points earned in this level"
          aria-valuemin={0}
          aria-valuemax={session.maxPoints}
          aria-valuenow={session.awardedPoints}
        >
          <span className={styles["progressValue"]} style={{ width: `${scoreProgress}%` }} />
        </span>
        <span className={styles["points"]}>
          {session.awardedPoints}/{session.maxPoints} points
        </span>
      </div>

      <div className={styles["card"]}>
        {challenge ? (
          <>
            <div className={styles["challengeMeta"]}>
              <span className={styles["typeBadge"]}>{challengeTypeLabel(challenge.type)}</span>
              <span className={styles["attemptBadge"]}>
                Attempt {Math.min(session.attemptsUsed + 1, session.maxAttempts)} of{" "}
                {session.maxAttempts}
              </span>
            </div>
            <h1 className={styles["prompt"]} id="challenge-title">
              {challenge.prompt}
            </h1>
            {challenge.instruction ? (
              <p className={styles["instruction"]}>{challenge.instruction}</p>
            ) : null}
          </>
        ) : null}

        {feedback ? (
          <div
            className={`${styles["feedback"]} ${
              feedback.status === "correct"
                ? styles["feedbackCorrect"]
                : feedback.status === "needs_review"
                  ? styles["feedbackReview"]
                  : styles["feedbackIncorrect"]
            }`}
            ref={feedbackRef}
            tabIndex={-1}
            role="status"
            aria-live="polite"
          >
            <p className={styles["feedbackTitle"]}>{feedbackTitle(feedback)}</p>
            <p className={styles["feedbackText"]}>{feedback.explanation}</p>
            <p className={styles["feedbackScore"]}>
              {feedback.status === "needs_review"
                ? "No points were awarded automatically."
                : `${feedback.awardedPoints} of ${feedback.maxPoints} points awarded.`}
            </p>
            <button className={styles["retryButton"]} type="button" onClick={continueAfterFeedback}>
              {feedback.retryAllowed
                ? "Try again"
                : session.state === "completed"
                  ? "See result"
                  : "Continue"}
            </button>
          </div>
        ) : challenge ? (
          <form className={styles["form"]} onSubmit={submit}>
            {(challenge.type === "multiple_choice" ||
              challenge.type === "true_false" ||
              challenge.type === "scenario") && (
              <fieldset className={styles["fieldset"]}>
                <legend className={styles["visuallyHidden"]}>Choose your answer</legend>
                {challenge.options.map((option) => {
                  const limit = challenge.type === "multiple_choice" ? challenge.selectionLimit : 1;
                  const inputType = limit === 1 ? "radio" : "checkbox";
                  return (
                    <label className={styles["option"]} key={option.key}>
                      <input
                        type={inputType}
                        name="challenge-answer"
                        value={option.key}
                        checked={selectedKeys.includes(option.key)}
                        onChange={(event) => toggleOption(option.key, event.target.checked, limit)}
                      />
                      <span className={styles["optionText"]}>
                        {option.accessibleLabel ?? option.label}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            )}

            {challenge.type === "ordering" ? (
              <ol className={styles["orderList"]} aria-label="Answer order">
                {orderedKeys.map((key, index) => {
                  const option = challenge.options.find((candidate) => candidate.key === key);
                  if (!option) return null;
                  return (
                    <li className={styles["orderItem"]} key={key}>
                      <span className={styles["orderNumber"]}>{index + 1}</span>
                      <span>{option.accessibleLabel ?? option.label}</span>
                      <span className={styles["orderControls"]}>
                        <button
                          className={styles["moveButton"]}
                          type="button"
                          onClick={() => moveOrder(index, -1)}
                          disabled={index === 0}
                          aria-label={`Move ${option.label} up`}
                        >
                          Up
                        </button>
                        <button
                          className={styles["moveButton"]}
                          type="button"
                          onClick={() => moveOrder(index, 1)}
                          disabled={index === orderedKeys.length - 1}
                          aria-label={`Move ${option.label} down`}
                        >
                          Down
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ol>
            ) : null}

            {challenge.type === "matching" ? (
              <div className={styles["matchingGrid"]}>
                {challenge.left.map((leftOption) => (
                  <div className={styles["matchRow"]} key={leftOption.key}>
                    <label className={styles["matchLabel"]} htmlFor={`match-${leftOption.key}`}>
                      {leftOption.accessibleLabel ?? leftOption.label}
                    </label>
                    <select
                      className={styles["select"]}
                      id={`match-${leftOption.key}`}
                      value={matches[leftOption.key] ?? ""}
                      onChange={(event) =>
                        setMatches((current) => ({
                          ...current,
                          [leftOption.key]: event.target.value,
                        }))
                      }
                      required
                    >
                      <option value="">Choose a match</option>
                      {challenge.right.map((rightOption) => (
                        <option
                          key={rightOption.key}
                          value={rightOption.key}
                          disabled={
                            selectedRightKeys.has(rightOption.key) &&
                            matches[leftOption.key] !== rightOption.key
                          }
                        >
                          {rightOption.accessibleLabel ?? rightOption.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            ) : null}

            {challenge.type === "fill_blank" ? (
              <input
                className={styles["input"]}
                value={textValue}
                onChange={(event) => setTextValue(event.target.value)}
                placeholder={challenge.placeholder}
                maxLength={challenge.maxLength}
                autoComplete="off"
                aria-label="Your answer"
                required
              />
            ) : null}

            {challenge.type === "short_response" ? (
              <>
                <textarea
                  className={styles["textarea"]}
                  value={textValue}
                  onChange={(event) => setTextValue(event.target.value)}
                  placeholder={challenge.placeholder}
                  maxLength={challenge.maxLength}
                  aria-describedby="short-response-notice short-response-count"
                  aria-label="Your response"
                  required
                />
                <p className={styles["instruction"]} id="short-response-notice">
                  {challenge.evaluationNotice}
                </p>
                <p className={styles["characterCount"]} id="short-response-count">
                  {textValue.length}/{challenge.maxLength}
                </p>
              </>
            ) : null}

            <button className={styles["submitButton"]} type="submit" disabled={!canSubmit}>
              {busy ? "Checking answer…" : "Check answer"}
            </button>
          </form>
        ) : null}

        {systemMessage ? (
          <div className={styles["systemMessage"]} role="alert">
            <p>{systemMessage}</p>
            {pendingSubmission ? (
              <button
                className={styles["retryButton"]}
                type="button"
                disabled={busy}
                onClick={() => void sendSubmission(pendingSubmission)}
              >
                Retry same answer
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
