// Captures an End request's originating run without coupling to rendering.
export function captureRun(state) {
  const session = state.sessionId, scenario = state.scenario, threads = state.threads;
  return () => state.sessionId === session && state.scenario === scenario && state.threads === threads;
}

export function createEndCoordinator() {
  let pending = null;
  return {
    busy: (session, scenario) => pending?.session === session && pending?.scenario === scenario,
    async run(session, scenario, request, isCurrent) {
      if (pending?.session === session && pending?.scenario === scenario) return null;
      const token = { session, scenario };
      pending = token;
      try {
        const result = await request(session);
        return isCurrent(session, scenario) ? result : null;
      } finally { if (pending === token) pending = null; }
    },
  };
}
