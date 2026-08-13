import type { Theme } from "./contracts";

export const DEFAULT_THEME: Theme = {
  formatVersion: 1,
  id: "clean-light",
  name: "Clean Light",
  author: "小豆包",
  wallpaper: {
    file: "wallpaper.png",
    fit: "cover",
    positionX: 50,
    positionY: 50,
    scale: 100,
    blur: 0,
    brightness: 100,
    overlayColor: "#ffffff",
    overlayOpacity: 0.1
  },
  palette: {
    ink: "#222222",
    mutedInk: "#666666",
    accent: "#4f7cff",
    surface: "#ffffff"
  },
  regions: {
    sidebar: {
      backgroundColor: "#ffffff", opacity: 0.9, textColor: "#222222",
      selectedColor: "#e8edff", borderColor: "#dfe3ec", borderRadius: 12
    },
    chat: {
      backgroundColor: "#ffffff", opacity: 0.72, userBubbleColor: "#e8edff",
      assistantBubbleColor: "#ffffff", textColor: "#222222", borderColor: "#dfe3ec",
      borderRadius: 16, shadowStrength: 0.12
    },
    composer: {
      backgroundColor: "#ffffff", opacity: 0.94, textColor: "#222222",
      borderColor: "#dfe3ec", borderRadius: 16, focusColor: "#4f7cff"
    },
    buttons: {
      primaryColor: "#4f7cff", backgroundColor: "#ffffff", textColor: "#222222",
      borderColor: "#dfe3ec", borderRadius: 10, shadowStrength: 0.12
    },
    settings: { panelColor: "#ffffff", opacity: 0.94 }
  }
};
