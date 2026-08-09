import type { Theme } from "./contracts";
import type { DerivedPalette } from "./palette-core";

export function applyDerivedPalette(theme: Theme, palette: DerivedPalette): Theme {
  return {
    ...structuredClone(theme),
    palette: {
      ink: palette.ink,
      mutedInk: palette.mutedInk,
      accent: palette.accent,
      surface: palette.surface
    },
    regions: {
      sidebar: {
        ...theme.regions.sidebar,
        backgroundColor: palette.surface,
        selectedColor: palette.accent,
        borderColor: palette.accent
      },
      chat: {
        ...theme.regions.chat,
        backgroundColor: palette.surface,
        borderColor: palette.accent
      },
      composer: {
        ...theme.regions.composer,
        backgroundColor: palette.surface,
        borderColor: palette.accent,
        focusColor: palette.accent
      },
      buttons: {
        ...theme.regions.buttons,
        primaryColor: palette.accent,
        backgroundColor: palette.surface,
        borderColor: palette.accent
      },
      settings: {
        ...theme.regions.settings,
        panelColor: palette.surface
      }
    }
  };
}
