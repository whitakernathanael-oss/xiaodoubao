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
        backgroundColor: palette.surfaceVariant,
        opacity: 0.72,
        textColor: palette.text,
        selectedColor: palette.secondary,
        borderColor: palette.border
      },
      chat: {
        ...theme.regions.chat,
        backgroundColor: palette.background,
        opacity: Math.max(theme.regions.chat.opacity, 0.72),
        userBubbleColor: palette.secondary,
        assistantBubbleColor: palette.surfaceVariant,
        textColor: palette.text,
        borderColor: palette.border
      },
      composer: {
        ...theme.regions.composer,
        backgroundColor: palette.surface,
        opacity: Math.max(theme.regions.composer.opacity, 0.94),
        textColor: palette.text,
        borderColor: palette.border,
        focusColor: palette.primary
      },
      buttons: {
        ...theme.regions.buttons,
        primaryColor: palette.primary,
        backgroundColor: palette.surfaceVariant,
        textColor: palette.text,
        borderColor: palette.border
      },
      settings: {
        ...theme.regions.settings,
        panelColor: palette.surface,
        opacity: Math.max(theme.regions.settings.opacity, 0.94)
      }
    }
  };
}
