export interface SkinBackgroundInput {
  temporarilyDisabled: boolean;
  shouldRun: boolean;
  manageStartup: boolean;
}

export interface SkinBackgroundDependencies {
  stopGuardian: () => void | Promise<void>;
  startGuardian: () => void | Promise<void>;
  installStartup: () => void | Promise<void>;
  removeStartup: () => void | Promise<void>;
  reportError?: (error: unknown) => void | Promise<void>;
}

export interface SkinAutomationState {
  temporarilyDisabled: boolean;
  persistenceEnabled: boolean;
  activeSkinExists: boolean;
  manageStartup: boolean;
}

export function shouldKeepSkinBackground(
  persistenceEnabled: boolean,
  activeSkinExists: boolean,
  temporarilyDisabled: boolean
): boolean {
  return persistenceEnabled && activeSkinExists && !temporarilyDisabled;
}

export async function reconcileSkinBackground(
  input: SkinBackgroundInput,
  dependencies: SkinBackgroundDependencies
): Promise<void> {
  const reportAndThrow = async (error: unknown): Promise<never> => {
    try { await dependencies.reportError?.(error); } catch { /* Preserve the reconciliation error. */ }
    throw error;
  };
  if (input.temporarilyDisabled || !input.shouldRun) {
    await dependencies.stopGuardian();
    if (input.manageStartup) {
      try {
        await dependencies.removeStartup();
      } catch (error) {
        await reportAndThrow(error);
      }
    }
    return;
  }

  let startupFailed = false;
  let startupError: unknown;
  if (input.manageStartup) {
    try {
      await dependencies.installStartup();
    } catch (error) {
      startupFailed = true;
      startupError = error;
    }
  }

  await dependencies.startGuardian();
  if (startupFailed) {
    await reportAndThrow(startupError);
  }
}

export async function reconcileSkinAutomationState(
  state: SkinAutomationState,
  loadActiveSkinExists: () => boolean | Promise<boolean>,
  dependencies: SkinBackgroundDependencies
): Promise<boolean> {
  let activeSkinExists = state.activeSkinExists;
  if (!state.temporarilyDisabled && state.persistenceEnabled) {
    activeSkinExists = await loadActiveSkinExists();
  }
  await reconcileSkinBackground({
    temporarilyDisabled: state.temporarilyDisabled,
    shouldRun: state.persistenceEnabled && activeSkinExists,
    manageStartup: state.manageStartup
  }, dependencies);
  return state.temporarilyDisabled || state.persistenceEnabled ? activeSkinExists : false;
}
