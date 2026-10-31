/**
 * 手机底部面板：贴底圆角卡 + 遮罩，系统返回与点遮罩关闭；内容在键盘之上（宿主页外壳随键盘收缩）。
 * 返回经 pageContext.registerDismiss 交给 Tau 仲裁（后开的面板先关）；不在插件页面里时只靠遮罩关闭。
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { PluginPageContext } from "@tau/plugins";
import { cn, lockBodyScroll, usePortalContainer } from "@tau/ui";

/** 页面把 pageContext 放进来，面板据此登记返回；首页卡片里没有 pageContext */
export const SheetHost = createContext<Pick<PluginPageContext, "registerDismiss"> | null>(null);

const DURATION = 240;

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  trailing,
  children,
}: {
  open: boolean;
  onClose(): void;
  title?: ReactNode;
  subtitle?: ReactNode;
  /** 标题行右侧（如「删除这次」「重说」） */
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const container = usePortalContainer();
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(frame);
    }
    setShown(false);
    const timer = window.setTimeout(() => setMounted(false), DURATION);
    return () => window.clearTimeout(timer);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    return lockBodyScroll(container.ownerDocument);
  }, [open, container]);
  const host = useContext(SheetHost);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open || !host) return;
    const handle = host.registerDismiss(() => close.current());
    return () => void handle.dispose();
  }, [open, host]);
  if (!mounted) return null;
  return createPortal(
    <div className="wt:fixed wt:inset-0 wt:z-[60]" data-no-edge-back onClick={event => event.stopPropagation()}>
        <div
          aria-hidden
          onClick={onClose}
          className={cn(
            "wt:bg-overlay wt:absolute wt:inset-0 wt:transition-opacity wt:duration-200",
            shown ? "wt:opacity-100" : "wt:opacity-0"
          )}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={typeof title === "string" ? title : undefined}
          className={cn(
            "wt:bg-surface wt:shadow-float wt:absolute wt:inset-x-0 wt:bottom-0 wt:flex wt:max-h-[88%] wt:flex-col wt:rounded-t-[26px] wt:px-[18px] wt:pt-2",
            "wt:pb-[max(12px,env(safe-area-inset-bottom))] wt:ease-tau-out wt:transition-transform wt:duration-[240ms]",
            shown ? "wt:translate-y-0" : "wt:translate-y-full"
          )}
        >
          <div aria-hidden className="wt:bg-line-1 wt:mx-auto wt:mb-3 wt:h-1 wt:w-9 wt:shrink-0 wt:rounded-full" />
          {(title || trailing) && (
            <div className="wt:mb-1 wt:flex wt:shrink-0 wt:items-center wt:gap-2">
              <h2 className="wt:text-[16px] wt:font-[650]">{title}</h2>
              {subtitle && <span className="wt:text-ink-3 wt:text-[12px]">{subtitle}</span>}
              <span className="wt:flex-1" />
              {trailing}
            </div>
          )}
          <div className="wt:min-h-0 wt:overflow-y-auto wt:overscroll-contain">{children}</div>
        </div>
    </div>,
    container
  );
}
