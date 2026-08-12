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
  if (input.temporarilyDisabled || !input.shouldRun) {
    await dependencies.stopGuardian();
    if (input.manageStartup) {
      await dependencies.removeStartup();
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
    throw startupError;
  }
}
