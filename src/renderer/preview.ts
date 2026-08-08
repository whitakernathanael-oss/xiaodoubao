import type { Theme } from "../shared/contracts";

export type PreviewPage = "chat" | "settings";

function setPreviewVariables(root: HTMLElement, theme: Theme, wallpaperUrl?: string): void {
  const variables: Record<string, string> = {
    "--p-ink": theme.palette.ink,
    "--p-muted": theme.palette.mutedInk,
    "--p-accent": theme.palette.accent,
    "--p-surface": theme.palette.surface,
    "--p-sidebar": theme.regions.sidebar.backgroundColor,
    "--p-sidebar-opacity": String(theme.regions.sidebar.opacity),
    "--p-chat": theme.regions.chat.backgroundColor,
    "--p-chat-opacity": String(theme.regions.chat.opacity),
    "--p-user": theme.regions.chat.userBubbleColor,
    "--p-assistant": theme.regions.chat.assistantBubbleColor,
    "--p-composer": theme.regions.composer.backgroundColor,
    "--p-composer-opacity": String(theme.regions.composer.opacity),
    "--p-settings": theme.regions.settings.panelColor,
    "--p-settings-opacity": String(theme.regions.settings.opacity),
    "--p-wallpaper-fit": theme.wallpaper.fit,
    "--p-wallpaper-x": `${theme.wallpaper.positionX}%`,
    "--p-wallpaper-y": `${theme.wallpaper.positionY}%`,
    "--p-wallpaper-scale": String(theme.wallpaper.scale / 100),
    "--p-wallpaper-blur": `${theme.wallpaper.blur}px`,
    "--p-wallpaper-brightness": `${theme.wallpaper.brightness}%`,
    "--p-overlay": theme.wallpaper.overlayColor,
    "--p-overlay-opacity": String(theme.wallpaper.overlayOpacity)
  };
  if (wallpaperUrl) variables["--p-wallpaper"] = `url(${JSON.stringify(wallpaperUrl)})`;
  for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);
}

export function renderPreview(root: HTMLElement, theme: Theme, page: PreviewPage, wallpaperUrl?: string): void {
  root.className = `preview preview--${page}`;
  setPreviewVariables(root, theme, wallpaperUrl);
  root.innerHTML = page === "chat" ? `
    <div class="preview__wallpaper" aria-hidden="true"></div>
    <div class="preview__overlay" aria-hidden="true"></div>
    <aside class="preview__sidebar">
      <div class="preview__brand"><span>豆</span><b>豆包</b></div>
      <button class="preview__new">＋ 新对话</button>
      <nav aria-label="预览侧栏">
        <a class="is-active">今天的灵感</a><a>图片创作</a><a>我的收藏</a>
      </nav>
    </aside>
    <section class="preview__chat">
      <header><b>新对话</b><span>本地预览</span></header>
      <div class="preview__messages">
        <article class="preview__assistant"><i>豆</i><p>你好，这是主题在聊天页面中的简化效果。</p></article>
        <article class="preview__user"><p>壁纸、颜色和区域样式会立即显示在这里。</p></article>
      </div>
      <div class="preview__composer"><span>输入消息…</span><button aria-label="发送">↑</button></div>
    </section>` : `
    <div class="preview__wallpaper" aria-hidden="true"></div>
    <div class="preview__overlay" aria-hidden="true"></div>
    <aside class="preview__settings-nav">
      <b>设置</b><a class="is-active">通用设置</a><a>账号设置</a><a>快捷键</a>
    </aside>
    <section class="preview__settings-panel">
      <header><b>通用设置</b><span>×</span></header>
      <label><span>开机自动启动</span><i class="preview__switch is-on"></i></label>
      <label><span>消息通知</span><i class="preview__switch"></i></label>
      <label><span>界面语言</span><em>简体中文　›</em></label>
    </section>`;
}
