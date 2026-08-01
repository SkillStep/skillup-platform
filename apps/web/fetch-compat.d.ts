export {};

type FetchCompatibleRequestInit = {
  [Key in keyof RequestInit]?: RequestInit[Key] | undefined;
};

declare global {
  function fetch(
    input: RequestInfo | URL,
    init?: FetchCompatibleRequestInit,
  ): Promise<Response>;
}
