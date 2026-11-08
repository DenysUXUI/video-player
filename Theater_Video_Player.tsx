/**
 * Theater Video Player — Framer code component
 *
 * Glassmorphism video player with URL/upload sources, native mobile fullscreen,
 * animated theater mode, keyboard-accessible custom controls, and full
 * Framer Property Controls.
 *
 * Icons inspired by Feather Icons (MIT) — https://feathericons.com
 *
 * License: MIT
 */

import { addPropertyControls, ControlType, RenderTarget, useIsStaticRenderer } from "framer"
import {
    useState,
    useRef,
    useEffect,
    useLayoutEffect,
    useCallback,
    useMemo,
    useSyncExternalStore,
    type CSSProperties,
    type KeyboardEvent as ReactKeyboardEvent,
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
    type RefObject,
} from "react"

export interface ThumbnailImage {
    src: string
    srcSet?: string
    alt?: string
}

interface FrameSettings {
    aspectRatio: "16:9" | "9:16" | "1:1" | "4:5"
    objectFit: "cover" | "contain"
    padding: number
    borderRadius: number
    borderOpacity: number
    backgroundColor: string
    blurAmount: number
}

interface PlaybackSettings {
    loop: boolean
    mutedByDefault: boolean
    autoplay: boolean
    autoHideControls: boolean
}

interface ControlsSettings {
    controlButtonSize: number
    controlButtonRadius: number
    controlButtonColor: string
    controlButtonBorderColor: string
    controlButtonBorderWidth: number
    controlButtonBlur: number
    progressColor: string
}

type MovedSettings = FrameSettings & PlaybackSettings & ControlsSettings

export interface Props extends MovedSettings {
    sourceType: "url" | "upload"
    videoUrl: string
    videoFile: string
    thumbnail?: ThumbnailImage
    // The same settings inside the grouped panel. See readSettings.
    frameProps?: Partial<FrameSettings>
    playbackProps?: Partial<PlaybackSettings>
    controlsProps?: Partial<ControlsSettings>
    style?: CSSProperties
}

function formatTime(secs: number): string {
    if (!isFinite(secs) || secs < 0) return "--:--"
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = Math.floor(secs % 60)
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    return `${m}:${s.toString().padStart(2, "0")}`
}

// Only let through URL schemes a media element legitimately needs
// (https, http, blob, data — covers CDNs, Framer uploads and relative paths).
// A whitelist instead of a blacklist: the URL parser normalizes tricks like
// tabs/newlines inside a scheme, so "java\tscript:" cannot slip past it.
const SAFE_MEDIA_PROTOCOLS = new Set(["http:", "https:", "blob:", "data:"])

function isSafeMediaUrl(url: string | undefined): boolean {
    if (!url) return false
    const trimmed = url.trim()
    if (!trimmed) return false
    try {
        // Relative URLs resolve against the page and inherit its protocol
        const base = typeof window !== "undefined" ? window.location.href : "https://localhost/"
        return SAFE_MEDIA_PROTOCOLS.has(new URL(trimmed, base).protocol)
    } catch {
        return false
    }
}

function IconPlay() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
    )
}

function IconPause() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="14" y="4" width="4" height="16" rx="1" />
            <rect x="6" y="4" width="4" height="16" rx="1" />
        </svg>
    )
}

function IconVolumeOn() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
    )
}

function IconVolumeOff() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="22" y1="9" x2="16" y2="15" />
            <line x1="16" y1="9" x2="22" y2="15" />
        </svg>
    )
}

function IconExpand() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
    )
}

function IconCollapse() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 14 10 14 10 20" />
            <polyline points="20 10 14 10 14 4" />
            <line x1="10" y1="14" x2="3" y2="21" />
            <line x1="21" y1="3" x2="14" y2="10" />
        </svg>
    )
}

// Turns from its first frame. An SVG <animateTransform> added after the page
// has loaded stood still for its whole first cycle in Chrome — 0.8 s, longer
// than most waits — so the spinner looked stuck.
function IconSpinner({ slow }: { slow: boolean }) {
    const ref = useRef<SVGSVGElement>(null)
    useEffect(() => {
        const el = ref.current
        if (!el || typeof el.animate !== "function") return
        const spin = el.animate(
            [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
            { duration: slow ? 2000 : 800, iterations: Infinity }
        )
        return () => spin.cancel()
    }, [slow])
    return (
        <svg ref={ref} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" opacity="0.25" />
            <path d="M21 12a9 9 0 0 0-9-9" />
        </svg>
    )
}

// Read by screen readers, invisible on screen
const visuallyHiddenStyle: CSSProperties = {
    position: "absolute",
    width: 1,
    height: 1,
    margin: -1,
    padding: 0,
    border: 0,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
}

const controlIconStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    pointerEvents: "none",
}

const controlIconInnerStyle: CSSProperties = {
    display: "grid",
    placeItems: "center",
    width: 18,
    height: 18,
}

// Convert designer-facing aspect ratio enum into numeric width/height
function parseAspectRatio(ratio: "16:9" | "9:16" | "1:1" | "4:5"): number {
    switch (ratio) {
        case "9:16": return 9 / 16
        case "1:1": return 1
        case "4:5": return 4 / 5
        case "16:9":
        default: return 16 / 9
    }
}

const DEFAULT_CONTROL_BUTTON_SIZE = 38
const DEFAULT_CONTROL_BUTTON_RADIUS = 12
const DEFAULT_CONTROL_BUTTON_BLUR = 14
const PROGRESS_TRACK_HEIGHT = 6
const PROGRESS_THUMB_WIDTH = 10
const PROGRESS_THUMB_HEIGHT = 18
const PROGRESS_THUMB_RADIUS = 4
// The browser reports the playback position about every 0.25 s. A glide a
// little longer than that gap is picked up by the next report before it
// ends, so the bar moves at an even speed instead of in jerks.
const PROGRESS_PLAYING_GLIDE = "0.3s linear"
// A reported position this much earlier than the last one is a jump back
const PROGRESS_JUMP_BACK_S = 0.1
const THEATER_DESKTOP_MARGIN = 48
const THEATER_TABLET_MARGIN = 24
const THEATER_MOBILE_MARGIN = 20
const THEATER_OPEN_MS = 380
const THEATER_CLOSE_MS = 320
const THEATER_OPEN_EASE = "cubic-bezier(0.2, 0, 0, 1)"
const THEATER_CLOSE_EASE = "cubic-bezier(0.4, 0, 0.6, 1)"
const MOBILE_NATIVE_FULLSCREEN_MAX_WIDTH = 767
// How long a phone waits for a cold video before giving up on fullscreen
const NATIVE_FULLSCREEN_WAIT_MS = 4000
// Touch screens warm up a player that stays on screen this long —
// long enough that flicking past it doesn't count
const TOUCH_WARM_UP_MS = 300
const TOUCH_WARM_UP_THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20)
// A cropped thumbnail asks for a sharper copy as soon as the first one
// arrives — the request is under way well within this long
const THUMB_RECHECK_MS = 100
// A wait shorter than this passes without a spinner flashing up
const LOADING_SPINNER_DELAY_MS = 300

type NativeFullscreenVideo = HTMLVideoElement & {
    webkitEnterFullscreen?: () => void
    webkitDisplayingFullscreen?: boolean
}

// Chrome 83+, Safari 15.4+, Firefox 132+
type FrameCallbackVideo = HTMLVideoElement & {
    requestVideoFrameCallback?: (callback: () => void) => number
}

// Popover API (Chrome 114+, Safari 17+, Firefox 125+) — older browsers skip
// the top layer and keep the plain fixed frame.
type PopoverElement = HTMLElement & {
    showPopover?: () => void
    hidePopover?: () => void
}

// useLayoutEffect warns during server rendering, and Framer pre-renders sites
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect

// A store that never changes — only its server/client snapshots matter
const subscribeNever = () => () => {}

function rectToFixedStyle(rect: Pick<DOMRect, "top" | "left" | "width" | "height">, transition = "none"): CSSProperties {
    return {
        position: "fixed",
        top: rect.top,
        left: rect.left,
        right: "auto",
        bottom: "auto",
        width: rect.width,
        height: rect.height,
        // The popover's default styles center it with auto margins and
        // reset the text color — keep our geometry and the page's color.
        // No max size either: page CSS aimed at [popover], or a max-width /
        // max-height from Framer's style, would squeeze the theater.
        margin: 0,
        color: "inherit",
        maxWidth: "none",
        maxHeight: "none",
        zIndex: 9999,
        transform: "none",
        willChange: "top, left, width, height",
        transition,
    }
}

function getTheaterMargin(viewportWidth: number) {
    if (viewportWidth <= MOBILE_NATIVE_FULLSCREEN_MAX_WIDTH) return THEATER_MOBILE_MARGIN
    if (viewportWidth <= 1199) return THEATER_TABLET_MARGIN
    return THEATER_DESKTOP_MARGIN
}

// "Mobile" needs a touch signal, not just a narrow window — otherwise a
// squeezed desktop window would get native fullscreen instead of the
// animated theater transition.
function shouldUseNativeMobileFullscreen() {
    if (typeof window === "undefined") return false
    if (window.innerWidth > MOBILE_NATIVE_FULLSCREEN_MAX_WIDTH) return false
    const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false
    const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0
    return coarsePointer || hasTouch
}

function prefersReducedMotion(): boolean {
    if (typeof window === "undefined" || !window.matchMedia) return false
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

// True when the element received focus via keyboard (:focus-visible),
// false for mouse/touch focus. Falls back to true in browsers without
// :focus-visible so keyboard users are never the ones penalized.
function isKeyboardFocus(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null
    if (!el || typeof el.matches !== "function") return false
    try {
        return el.matches(":focus-visible")
    } catch {
        return true
    }
}

function getTheaterStyle(framePadding: number, aspect: number, transition = "none"): CSSProperties {
    if (typeof window === "undefined") return {}
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    // Lay out inside clientWidth: innerWidth also counts a classic scrollbar
    // (Windows), which pushed the theater off-center
    const layoutWidth = document.documentElement.clientWidth || viewportWidth
    const margin = getTheaterMargin(viewportWidth)
    const maxWidth = Math.max(0, layoutWidth - margin * 2)
    const maxHeight = Math.max(0, viewportHeight - margin * 2)
    const maxVideoWidth = Math.max(0, maxWidth - framePadding * 2)
    const maxVideoHeight = Math.max(0, maxHeight - framePadding * 2)
    const videoWidth = Math.min(maxVideoWidth, maxVideoHeight * aspect)
    const videoHeight = videoWidth / aspect
    const width = videoWidth + framePadding * 2
    const height = videoHeight + framePadding * 2

    return {
        position: "fixed",
        top: margin + (maxHeight - height) / 2,
        left: margin + (maxWidth - width) / 2,
        right: "auto",
        bottom: "auto",
        width,
        height,
        margin: 0,
        color: "inherit",
        maxWidth: "none",
        maxHeight: "none",
        zIndex: 9999,
        transform: "none",
        willChange: "top, left, width, height",
        transition,
    }
}

// Reusable icon control for controls row
function ControlBtn({ ariaLabel, onClick, onMouseEnter, onMouseLeave, onMouseDown, onMouseUp, buttonStyle, children }: {
    ariaLabel: string
    onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void
    onMouseEnter: () => void
    onMouseLeave: () => void
    onMouseDown?: () => void
    onMouseUp?: () => void
    buttonStyle: CSSProperties
    children: ReactNode
}) {
    const [focused, setFocused] = useState(false)
    const focusedStyle: CSSProperties = focused
        ? { boxShadow: "0 0 0 2px rgba(255,255,255,0.9)" }
        : {}
    return (
        <button
            type="button"
            aria-label={ariaLabel}
            onClick={onClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
            onFocus={(e) => setFocused(isKeyboardFocus(e.target))}
            onBlur={() => setFocused(false)}
            style={{ ...buttonStyle, ...focusedStyle }}
        >
            <span style={controlIconStyle}>
                <span style={controlIconInnerStyle}>
                    {children}
                </span>
            </span>
        </button>
    )
}

/**
 * Theater-mode state machine.
 *
 * Owns the open/close transitions, the Escape-to-close listener, the
 * rAF-throttled resize handler, and the native mobile-fullscreen fallback.
 * Extracted so the main component stays focused on playback state.
 *
 * `onActivate` is called whenever the user interacts with theater mode
 * (open or close) so the parent can reveal controls and reset auto-hide.
 */
function useTheaterMode({
    rootRef,
    placeholderRef,
    videoRef,
    padding,
    aspect,
    onActivate,
}: {
    rootRef: RefObject<HTMLDivElement>
    placeholderRef: RefObject<HTMLDivElement>
    videoRef: RefObject<HTMLVideoElement>
    padding: number
    aspect: number
    onActivate: () => void
}) {
    const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const smallRect = useRef<DOMRect | null>(null)
    // Page scroll position at open time — the page behind the theater can
    // still scroll, so the close animation must shift its target by the delta.
    const smallScroll = useRef<{ x: number; y: number } | null>(null)
    const nativeFsCleanup = useRef<(() => void) | null>(null)
    // Stops listening for the end of the close animation
    const stopCloseWait = useRef<(() => void) | null>(null)
    // Stops waiting to enter system fullscreen (see openNativeFullscreen)
    const stopNativeWait = useRef<(() => void) | null>(null)
    const [isExpanded, setIsExpanded] = useState(false)
    const [theaterStyle, setTheaterStyle] = useState<CSSProperties | null>(null)

    // Clean up timers and any active native-fullscreen listeners on unmount
    useEffect(() => () => {
        if (expandTimer.current) clearTimeout(expandTimer.current)
        if (nativeFsCleanup.current) nativeFsCleanup.current()
        stopCloseWait.current?.()
        stopNativeWait.current?.()
    }, [])

    // While the frame is detached (open, plus both animations) it lives in the
    // browser's top layer. Otherwise an ancestor with a transform, filter or
    // will-change — Framer appear and scroll effects — turns "fixed to the
    // screen" into "fixed to that ancestor": the theater shifts, clips and
    // scrolls with the page. Same element, so the video keeps playing.
    // A layout effect, so the switch lands in the same frame as the geometry.
    const isDetached = theaterStyle !== null
    useIsomorphicLayoutEffect(() => {
        const root = rootRef.current as PopoverElement | null
        if (!isDetached || !root || typeof root.showPopover !== "function") return
        try {
            root.setAttribute("popover", "manual")
            root.showPopover()
        } catch {
            root.removeAttribute("popover")
            return
        }
        return () => {
            // Hiding a popover can send focus back to wherever it was when the
            // popover opened — outside the player in Safari, where clicks
            // don't focus buttons. Keep it where the user left it.
            const focused = document.activeElement as HTMLElement | null
            try {
                root.hidePopover?.()
            } catch {
                // Already hidden (e.g. the element left the page)
            }
            root.removeAttribute("popover")
            if (focused && focused !== document.activeElement && root.contains(focused)) {
                focused.focus({ preventScroll: true })
            }
        }
    }, [isDetached, rootRef])

    const closeExpand = useCallback(() => {
        if (expandTimer.current) clearTimeout(expandTimer.current)
        stopCloseWait.current?.()
        const current = rootRef.current?.getBoundingClientRect()
        // Land on the placeholder: it holds the player's real spot, so it
        // already reflects any scroll, resize or rotation since opening —
        // the frame doesn't jump after the animation ends.
        // Fallback: the rect from open time, shifted by the page scroll.
        const small = smallRect.current
        const openScroll = smallScroll.current
        const target = placeholderRef.current?.getBoundingClientRect() ?? (small && {
            top: small.top + (openScroll ? openScroll.y - window.scrollY : 0),
            left: small.left + (openScroll ? openScroll.x - window.scrollX : 0),
            width: small.width,
            height: small.height,
        })
        if (!current || !target || prefersReducedMotion()) {
            setIsExpanded(false)
            setTheaterStyle(null)
            return
        }

        const root = rootRef.current
        const finish = () => {
            stopCloseWait.current?.()
            if (expandTimer.current) clearTimeout(expandTimer.current)
            expandTimer.current = null
            setIsExpanded(false)
            setTheaterStyle(null)
        }
        // Until the glide starts: a background tab runs no frames at all
        const timer = setTimeout(finish, THEATER_CLOSE_MS + 250)
        expandTimer.current = timer

        setTheaterStyle(rectToFixedStyle(current))
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                // A newer close took over (Escape pressed again)
                if (expandTimer.current !== timer) return
                setTheaterStyle(rectToFixedStyle(
                    target,
                    `top ${THEATER_CLOSE_MS}ms ${THEATER_CLOSE_EASE}, left ${THEATER_CLOSE_MS}ms ${THEATER_CLOSE_EASE}, width ${THEATER_CLOSE_MS}ms ${THEATER_CLOSE_EASE}, height ${THEATER_CLOSE_MS}ms ${THEATER_CLOSE_EASE}`
                ))
                // Settle when the glide really ends. A timer counted from the
                // call started two frames before the glide did, so it cut the
                // last 3–5 px short and the frame jumped into place.
                const isGlide = (e: TransitionEvent) =>
                    e.target === root && /^(top|left|width|height)$/.test(e.propertyName)
                const onEnd = (e: TransitionEvent) => {
                    if (isGlide(e)) finish()
                }
                // The fallback counts from when the glide really starts: on a
                // busy page that can be well after this frame, and a timer
                // armed here cut the glide short again
                const onRun = (e: TransitionEvent) => {
                    if (!isGlide(e)) return
                    root?.removeEventListener("transitionrun", onRun)
                    if (expandTimer.current) clearTimeout(expandTimer.current)
                    expandTimer.current = setTimeout(finish, THEATER_CLOSE_MS + 50)
                }
                root?.addEventListener("transitionend", onEnd)
                root?.addEventListener("transitionrun", onRun)
                stopCloseWait.current = () => {
                    root?.removeEventListener("transitionend", onEnd)
                    root?.removeEventListener("transitionrun", onRun)
                    stopCloseWait.current = null
                }
                // Already in place: nothing glides and no event comes
                clearTimeout(timer)
                expandTimer.current = setTimeout(finish, THEATER_CLOSE_MS + 250)
            })
        })
    }, [rootRef, placeholderRef])

    // Theater mode keyboard handling: Escape closes; Tab/Shift+Tab cycle focus
    // within the component so the user cannot tab-escape into the page behind.
    useEffect(() => {
        if (!isExpanded) return

        const focusableSelector = 'button, [tabindex]:not([tabindex="-1"])'
        const getFocusable = (): HTMLElement[] => {
            const root = rootRef.current
            if (!root) return []
            return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector))
        }

        // Move focus into the player when theater opens (if it isn't already inside)
        const initial = getFocusable()
        if (
            initial.length > 0 &&
            !rootRef.current?.contains(document.activeElement)
        ) {
            initial[0].focus()
        }

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                closeExpand()
                return
            }
            if (e.key !== "Tab") return
            const elements = getFocusable()
            if (elements.length === 0) return
            const first = elements[0]
            const last = elements[elements.length - 1]
            const active = document.activeElement as HTMLElement | null
            if (e.shiftKey && active === first) {
                e.preventDefault()
                last.focus()
            } else if (!e.shiftKey && active === last) {
                e.preventDefault()
                first.focus()
            }
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [isExpanded, closeExpand, rootRef])

    // Re-fit theater frame to viewport on resize (rAF-throttled)
    useEffect(() => {
        if (!isExpanded) return
        let rafId: number | null = null
        const onResize = () => {
            if (expandTimer.current) return
            if (rafId !== null) return
            rafId = requestAnimationFrame(() => {
                rafId = null
                setTheaterStyle(getTheaterStyle(padding, aspect))
            })
        }
        window.addEventListener("resize", onResize)
        return () => {
            if (rafId !== null) cancelAnimationFrame(rafId)
            window.removeEventListener("resize", onResize)
        }
    }, [isExpanded, padding, aspect])

    const openTheater = useCallback(() => {
        const rect = rootRef.current?.getBoundingClientRect() ?? null
        smallRect.current = rect
        smallScroll.current = { x: window.scrollX, y: window.scrollY }
        if (expandTimer.current) clearTimeout(expandTimer.current)

        if (rect && !prefersReducedMotion()) {
            setTheaterStyle(rectToFixedStyle(rect))
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setTheaterStyle(getTheaterStyle(
                        padding,
                        aspect,
                        `top ${THEATER_OPEN_MS}ms ${THEATER_OPEN_EASE}, left ${THEATER_OPEN_MS}ms ${THEATER_OPEN_EASE}, width ${THEATER_OPEN_MS}ms ${THEATER_OPEN_EASE}, height ${THEATER_OPEN_MS}ms ${THEATER_OPEN_EASE}`
                    ))
                })
            })
        } else {
            setTheaterStyle(getTheaterStyle(padding, aspect))
        }
        setIsExpanded(true)
    }, [padding, aspect, rootRef])

    const openNativeFullscreen = useCallback((): boolean => {
        const video = videoRef.current as NativeFullscreenVideo | null
        if (!video) return false
        stopNativeWait.current?.()

        const resetNativeControls = () => {
            if (document.fullscreenElement) return
            video.controls = false
            document.removeEventListener("fullscreenchange", resetNativeControls)
            video.removeEventListener("webkitendfullscreen", resetNativeControls)
            nativeFsCleanup.current = null
        }

        video.controls = true
        document.addEventListener("fullscreenchange", resetNativeControls)
        video.addEventListener("webkitendfullscreen", resetNativeControls)
        nativeFsCleanup.current = () => {
            video.controls = false
            document.removeEventListener("fullscreenchange", resetNativeControls)
            video.removeEventListener("webkitendfullscreen", resetNativeControls)
            nativeFsCleanup.current = null
        }

        try {
            if (video.webkitEnterFullscreen && !video.webkitDisplayingFullscreen) {
                video.webkitEnterFullscreen()
                return true
            }
            if (video.requestFullscreen) {
                video.requestFullscreen().catch(resetNativeControls)
                return true
            }
        } catch {
            resetNativeControls()
            // Loaded, broken or empty: the animated theater, as before
            if (
                video.readyState >= HTMLMediaElement.HAVE_METADATA ||
                video.error ||
                !video.getAttribute("src")
            ) return false
            // iPhone refuses system fullscreen for a video that has loaded
            // nothing yet — and behind a thumbnail nothing loads before
            // warm-up, so the button only widened the frame, with no video.
            // Start playback in this tap instead (the tap also lifts
            // Safari's "fullscreen needs a tap" rule) and go fullscreen as
            // soon as the video knows its size; if it still refuses, the
            // animated theater opens. Pausing or a failure calls it off.
            let timer: ReturnType<typeof setTimeout> | null = null
            const stop = () => {
                if (timer) clearTimeout(timer)
                video.removeEventListener("loadedmetadata", onReady)
                video.removeEventListener("pause", stop)
                video.removeEventListener("error", stop)
                stopNativeWait.current = null
            }
            const onReady = () => {
                stop()
                if (!openNativeFullscreen()) openTheater()
            }
            video.addEventListener("loadedmetadata", onReady)
            video.addEventListener("pause", stop)
            video.addEventListener("error", stop)
            // Too long a wait and the moment has passed — it plays in place
            timer = setTimeout(stop, NATIVE_FULLSCREEN_WAIT_MS)
            stopNativeWait.current = stop
            video.play().catch(stop)
            return true
        }

        resetNativeControls()
        return false
    }, [videoRef, openTheater])

    const toggleExpand = useCallback((e: ReactMouseEvent<HTMLButtonElement>) => {
        e.stopPropagation()
        onActivate()
        if (!isExpanded) {
            if (shouldUseNativeMobileFullscreen() && openNativeFullscreen()) return
            openTheater()
        } else {
            closeExpand()
        }
    }, [isExpanded, onActivate, openNativeFullscreen, openTheater, closeExpand])

    return { isExpanded, theaterStyle, toggleExpand }
}

// —— Settings under two names ——
// Framer stores a value under the name of its setting, so a value does not
// follow a setting into a group: moving a setting would wipe what a buyer set.
// That is why these 18 settings exist twice. The old flat names keep the old
// values and show in the panel of a player that has one of them changed. The
// groups (frameProps, playbackProps, controlsProps) show on every other player.
// Never rename or remove an old name, and never change one of these defaults.
const MOVED_SETTING_DEFAULTS: MovedSettings = {
    aspectRatio: "16:9",
    objectFit: "cover",
    padding: 8,
    borderRadius: 16,
    borderOpacity: 0.3,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    blurAmount: 20,
    loop: true,
    mutedByDefault: true,
    autoplay: false,
    autoHideControls: false,
    controlButtonSize: DEFAULT_CONTROL_BUTTON_SIZE,
    controlButtonRadius: DEFAULT_CONTROL_BUTTON_RADIUS,
    controlButtonColor: "rgba(255, 255, 255, 0.1)",
    controlButtonBorderColor: "rgba(255, 255, 255, 0.16)",
    controlButtonBorderWidth: 1,
    controlButtonBlur: DEFAULT_CONTROL_BUTTON_BLUR,
    progressColor: "#FFFFFF",
}

const MOVED_SETTINGS = Object.keys(MOVED_SETTING_DEFAULTS) as (keyof MovedSettings)[]

// One spelling for one colour. An untouched colour comes as written in the code
// (#FFFFFF) and a picked one in Framer's format (rgb(255, 255, 255)), and they
// must not count as two values. Any other string comes back as it is.
function colorKey(value: string): string {
    const text = value.trim().toLowerCase()
    const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text)
    if (hex) {
        const digits = hex[1].length <= 4 ? hex[1].replace(/./g, "$&$&") : hex[1]
        const [r, g, b, a = 255] = (digits.match(/../g) ?? []).map((pair) => parseInt(pair, 16))
        return [r, g, b, Math.round((a / 255) * 100) / 100].join()
    }
    const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+)(%?))?\s*\)$/.exec(text)
    if (rgb) {
        const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]) / (rgb[5] ? 100 : 1)
        return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Math.round(alpha * 100) / 100].join()
    }
    return text
}

function isChangedSetting(name: keyof MovedSettings, value: unknown): boolean {
    const fallback = MOVED_SETTING_DEFAULTS[name]
    if (value === undefined || value === fallback) return false
    if (typeof value === "string" && typeof fallback === "string") {
        return colorKey(value) !== colorKey(fallback)
    }
    return true
}

// A changed old value wins, then the group, then the default. The panel never
// lets a buyer edit both names of one setting, so one of them is always at its
// default. Reading setting by setting means a surprise in one (a site script
// or a code override setting an old name) leaves the group values of the rest.
function readSettings(props: Props): Props {
    const groups: Partial<MovedSettings> = {
        ...props.frameProps,
        ...props.playbackProps,
        ...props.controlsProps,
    }
    const settings: Record<string, unknown> = { ...props }
    for (const name of MOVED_SETTINGS) {
        if (!isChangedSetting(name, props[name])) {
            settings[name] = groups[name] ?? MOVED_SETTING_DEFAULTS[name]
        }
    }
    return settings as unknown as Props
}

/**
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight auto
 * @framerIntrinsicWidth 640
 * @framerIntrinsicHeight 360
 */
export default function TheaterVideoPlayer(props: Props) {
    const {
        sourceType = "url",
        videoUrl = "",
        videoFile = "",
        thumbnail,
        aspectRatio,
        loop,
        mutedByDefault,
        objectFit,
        autoplay,
        autoHideControls,
        padding,
        borderRadius,
        borderOpacity,
        backgroundColor,
        blurAmount,
        controlButtonSize,
        controlButtonRadius,
        controlButtonColor,
        controlButtonBorderColor,
        controlButtonBorderWidth,
        controlButtonBlur,
        progressColor,
        style,
    } = readSettings(props)
    const videoRef = useRef<HTMLVideoElement>(null)
    const thumbRef = useRef<HTMLImageElement>(null)
    const rootRef = useRef<HTMLDivElement>(null)
    const placeholderRef = useRef<HTMLDivElement>(null)
    const progressRef = useRef<HTMLDivElement>(null)
    const isScrubbingRef = useRef(false)
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    // Keyboard focus parked on a control blocks auto-hide entirely —
    // hiding the controls would silently throw the user's focus away (WCAG).
    const focusWithinControlsRef = useRef(false)
    const mouseMoveRafRef = useRef<number | null>(null)
    const scrubRectRef = useRef<DOMRect | null>(null)
    // The time tooltip opened by keyboard seeking has no mouse-leave to close
    // it, so it dismisses itself after a short pause instead.
    const keyTooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    // Framer's check for static renders (canvas and export). The Marketplace
    // review flags components that don't use this hook by name.
    const isStaticRenderer = useIsStaticRenderer()

    const [isPlaying, setIsPlaying] = useState(false)
    const [isMuted, setIsMuted] = useState(mutedByDefault)
    const [durationSeconds, setDurationSeconds] = useState(0)
    const [currentTime, setCurrentTime] = useState(0)
    // A reported position earlier than the last one is a jump back — a loop
    // starting over, a seek. The bar snaps there instead of sweeping back
    // across the whole track (it did on every loop).
    const reportedTimeRef = useRef(0)
    const [jumpedBack, setJumpedBack] = useState(false)
    // Where the bar was tapped before the video knew its length (0–1)
    const [pendingSeek, setPendingSeek] = useState<number | null>(null)
    const [isScrubbing, setIsScrubbing] = useState(false)
    const [hoverTime, setHoverTime] = useState<number | null>(null)
    const [hoverPercent, setHoverPercent] = useState(0)
    const [controlsVisible, setControlsVisible] = useState(true)

    const [hoveredButton, setHoveredButton] = useState<"play" | "mute" | "expand" | null>(null)
    const [playActive, setPlayActive] = useState(false)
    const [progressFocused, setProgressFocused] = useState(false)
    // The thumbnail stays until a video frame is on screen. Hiding it at
    // Play left an empty frame for the whole cold start, and a start that
    // failed lost it for good. Like a native poster, it comes back while a
    // retry reloads the video.
    const [frameShown, setFrameShown] = useState(false)
    // Playback position when "playing" arrived — once it moves on, frames
    // are being drawn even if no frame callback reports it
    const playingFromRef = useRef<number | null>(null)
    // Playback should be running but the video has no data yet (cold start,
    // a stall, a retry). Before, a frozen frame and the Pause icon were all
    // a visitor saw — for several seconds on a slow connection.
    const [isWaiting, setIsWaiting] = useState(false)
    const [spinnerDue, setSpinnerDue] = useState(false)
    useEffect(() => {
        if (!isWaiting) return
        const timer = setTimeout(() => setSpinnerDue(true), LOADING_SPINNER_DELAY_MS)
        return () => {
            clearTimeout(timer)
            setSpinnerDue(false)
        }
    }, [isWaiting])
    const showSpinner = isWaiting && spinnerDue
    const [loadError, setLoadError] = useState(false)
    const [warmedUp, setWarmedUp] = useState(false)
    const [thumbWidth, setThumbWidth] = useState(0)
    // True when this player came from server HTML (a published page's first
    // load), false when React built it in the browser. Fixed at mount.
    const isClientRender = useSyncExternalStore(subscribeNever, () => true, () => false)
    const [hydrated] = useState(() => !isClientRender)

    const scheduleHide = () => {
        if (hideTimer.current) clearTimeout(hideTimer.current)
        setControlsVisible(true)
        if (!autoHideControls) return
        hideTimer.current = setTimeout(() => {
            if (focusWithinControlsRef.current) return
            setControlsVisible(false)
        }, 2200)
    }

    // Controls must come back on their own whenever playback stops —
    // handleMouseMove ignores movement while not playing, so a pause or end
    // that happens outside our UI (media keys, native fullscreen controls)
    // would otherwise leave them hidden with no way to bring them back.
    const revealControls = () => {
        if (hideTimer.current) clearTimeout(hideTimer.current)
        setControlsVisible(true)
    }

    // Theater mode lives in its own hook (open/close, escape, resize, native FS)
    const handleTheaterActivate = useCallback(() => {
        setControlsVisible(true)
        if (hideTimer.current) clearTimeout(hideTimer.current)
    }, [])
    const aspect = parseAspectRatio(aspectRatio)
    const { isExpanded, theaterStyle, toggleExpand } = useTheaterMode({
        rootRef,
        placeholderRef,
        videoRef,
        padding,
        aspect,
        onActivate: handleTheaterActivate,
    })

    // Clear the auto-hide timer + any pending mouse-move rAF on unmount
    // (theater-mode timers are cleaned in the hook)
    useEffect(() => () => {
        if (hideTimer.current) clearTimeout(hideTimer.current)
        if (mouseMoveRafRef.current !== null) cancelAnimationFrame(mouseMoveRafRef.current)
        if (keyTooltipTimer.current) clearTimeout(keyTooltipTimer.current)
    }, [])

    useEffect(() => {
        if (autoHideControls) return
        if (hideTimer.current) clearTimeout(hideTimer.current)
        setControlsVisible(true)
    }, [autoHideControls])

    // True while the video is silent only because autoplay muted it — the
    // visitor hasn't chosen that, so their Play brings the Muted setting back
    const autoMutedRef = useRef(false)

    // Keep mute state in sync when the designer toggles the prop in Framer panel
    useEffect(() => {
        autoMutedRef.current = false
        setIsMuted(mutedByDefault)
        if (videoRef.current) videoRef.current.muted = mutedByDefault
    }, [mutedByDefault])

    // Off-screen players stay still. Autoplay waits until the player is on
    // screen, and a muted video that scrolls out of view pauses until it's
    // back — before, every autoplay player downloaded and decoded for nobody
    // (three players, two below the fold: 40 MB and +75% CPU). A video with
    // sound keeps playing (someone may be listening), and a pause the
    // visitor made is never undone: only a pause made here is resumed.
    const inViewRef = useRef<boolean | null>(null) // null until first report
    const autoplayPendingRef = useRef(false)
    const pausedOffscreenRef = useRef(false)
    // A pause and resume made here for scrolling aren't the visitor's: with
    // Auto Hide they leave the controls as they were — before, the controls
    // flashed up for 2 s every time an autoplay video came back on screen
    const resumingRef = useRef(false)
    // Pauses made here whose "pause" event hasn't arrived yet. On a busy page
    // that event can come after the player is already back on screen and
    // resumed, so a flag cleared by the resume missed it and the controls
    // flashed up anyway.
    const ownPausesRef = useRef(0)

    const tryAutoplay = useCallback(() => {
        const v = videoRef.current
        if (!v || !autoplayPendingRef.current || inViewRef.current !== true) return
        autoplayPendingRef.current = false
        // Already playing — a visitor pressed Play before Autoplay came on
        // (a hover variant switches it on the fly). Muting it would cut the
        // sound they are listening to.
        if (!v.paused && !v.ended) return
        // Autoplay always starts silent: sound nobody asked for is an
        // accessibility failure (WCAG 1.4.2), and browsers block it anyway —
        // with Muted off the video used to just sit there. The Muted
        // setting takes over when a visitor presses Play.
        if (!v.muted) {
            v.muted = true
            autoMutedRef.current = true
            setIsMuted(true)
        }
        // onPlay takes care of the rest of the UI (auto-hide timer)
        v.play().then(() => {
            setIsPlaying(true)
        }).catch((err: unknown) => {
            // Blocked even silent (iOS Low Power Mode): nothing is playing,
            // so give the sound setting back. Not on an interrupted start —
            // that video may resume later, and it must resume silent.
            if ((err as Error | null)?.name !== "NotAllowedError" || !autoMutedRef.current) return
            autoMutedRef.current = false
            v.muted = false
            setIsMuted(false)
        })
    }, [])

    useEffect(() => {
        const v = videoRef.current
        if (!v || isStaticRenderer) return
        if (typeof IntersectionObserver === "undefined") {
            // Older browsers: autoplay right away, as before
            inViewRef.current = true
            tryAutoplay()
            return
        }
        const observer = new IntersectionObserver((entries) => {
            // A busy page can deliver several reports at once — the last one
            // is where the player is now
            const entry = entries[entries.length - 1]
            inViewRef.current = entry.isIntersecting
            if (entry.isIntersecting) {
                if (pausedOffscreenRef.current) {
                    pausedOffscreenRef.current = false
                    if (v.paused) {
                        resumingRef.current = true
                        v.play().catch(() => {
                            // Stays paused, so the controls must show
                            resumingRef.current = false
                            revealControls()
                        })
                    }
                }
                tryAutoplay()
                return
            }
            // Fullscreen and picture-in-picture are on screen whatever the
            // page layout says
            const fullscreen = document.fullscreenElement
            if (
                v.paused || !v.muted ||
                (fullscreen && fullscreen.contains(v)) ||
                (v as NativeFullscreenVideo).webkitDisplayingFullscreen ||
                document.pictureInPictureElement === v
            ) return
            pausedOffscreenRef.current = true
            ownPausesRef.current += 1
            v.pause()
        })
        observer.observe(v)
        return () => observer.disconnect()
    }, [isStaticRenderer, tryAutoplay])

    // Autoplay on mount / when source changes — once the player is on screen.
    // Never on the canvas, in image export or in project thumbnails — a video
    // must not start playing there. Listing the excluded targets (like
    // Framer's own Video component does) keeps autoplay working on the
    // preview and the published site even if Framer adds new targets.
    useEffect(() => {
        autoplayPendingRef.current = false
        if (!autoplay) return
        const target = RenderTarget.current()
        if (
            isStaticRenderer ||
            target === RenderTarget.canvas ||
            target === RenderTarget.export ||
            target === RenderTarget.thumbnail
        ) return
        const src = (sourceType === "upload" ? videoFile : videoUrl) || undefined
        if (!src) return
        autoplayPendingRef.current = true
        tryAutoplay()
    }, [autoplay, sourceType, videoFile, videoUrl, isStaticRenderer, tryAutoplay])

    // Reset playback + UI state when the source changes so a new video starts clean,
    // then read what the <video> element already knows. On a published site the
    // page arrives as static HTML and the video starts loading before React
    // attaches its handlers — metadata or an error reported in that window is
    // never delivered, which left the progress bar stuck at --:--. This sync
    // lives inside the reset effect so the reset can't wipe what it reads.
    useEffect(() => {
        setLoadError(false)
        setFrameShown(false)
        playingFromRef.current = null
        setIsWaiting(false)
        setIsPlaying(false)
        setCurrentTime(0)
        reportedTimeRef.current = 0
        setJumpedBack(false)
        setPendingSeek(null)
        ownPausesRef.current = 0
        setDurationSeconds(0)
        setHoverTime(null)
        setHoverPercent(0)
        pausedOffscreenRef.current = false

        const v = videoRef.current
        if (!v) return
        // Removing the src attribute doesn't stop a <video> — the old file kept
        // playing (with sound, if unmuted) behind the "Add a video URL" hint.
        if (!v.getAttribute("src") && v.currentSrc) v.load()
        if (v.error) setLoadError(true)
        if (v.readyState >= HTMLMediaElement.HAVE_METADATA) {
            setDurationSeconds(isFinite(v.duration) ? v.duration : 0)
            setCurrentTime(v.currentTime)
        }
        if (!v.paused) {
            setIsPlaying(true)
            if (v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) setFrameShown(true)
        }
    }, [sourceType, videoUrl, videoFile])

    // A player behind a thumbnail downloads nothing until someone shows
    // interest (see `preload` on the <video>). Pointing at it, tabbing into
    // it or touching it says Play may be next: fetch the metadata now.
    // On touch screens, stopping on it counts too (see holdsDownload).
    const warmUp = () => {
        const v = videoRef.current
        if (!v || v.preload !== "none") return
        v.preload = "metadata"
        setWarmedUp(true)
    }

    // The page scrolling under a resting mouse sends pointer events too —
    // always at the same spot. Only a pointer that really moves over the
    // player counts, or a wheel-scrolling visitor warms every player passed.
    const lastPointerRef = useRef<{ x: number; y: number } | null>(null)
    const handlePointerMoveWarmUp = (e: ReactPointerEvent<HTMLDivElement>) => {
        const last = lastPointerRef.current
        lastPointerRef.current = { x: e.clientX, y: e.clientY }
        if (last && (last.x !== e.clientX || last.y !== e.clientY)) warmUp()
    }

    const togglePlay = () => {
        const v = videoRef.current
        if (!v) return
        // A media element in an error state rejects every play() call, so one
        // network hiccup used to leave the player dead until a page reload.
        // Play now doubles as a retry: reload the source and resume where it stopped.
        const failed = loadError || !!v.error
        if (isPlaying && !failed) {
            v.pause()
            setIsPlaying(false)
            revealControls()
        } else {
            warmUp()
            // A visitor's Play: if only autoplay muted the video, the
            // designer's Muted setting applies now (a click allows sound)
            if (autoMutedRef.current) {
                autoMutedRef.current = false
                v.muted = false
                setIsMuted(false)
            }
            if (failed) {
                const resumeAt = v.currentTime
                setLoadError(false)
                v.load()
                // Before metadata arrives this sets the start position for the reload
                if (resumeAt > 0) v.currentTime = resumeAt
            }
            // Optimistic UI; roll back if the browser rejects play()
            // (iOS Safari rejects when there is no user gesture context)
            setIsPlaying(true)
            scheduleHide()
            const playPromise = v.play()
            if (playPromise && typeof playPromise.catch === "function") {
                playPromise.catch(() => {
                    setIsPlaying(false)
                    revealControls()
                })
            }
        }
    }

    const toggleMute = (e: ReactMouseEvent<HTMLButtonElement>) => {
        e.stopPropagation()
        const v = videoRef.current
        if (!v) return
        // The visitor picked the sound themselves — Play no longer overrides it
        autoMutedRef.current = false
        v.muted = !isMuted
        setIsMuted(!isMuted)
    }

    const getProgressRatioFromClientX = (clientX: number) => {
        const track = progressRef.current
        if (!track) return 0
        // Reuse the rect captured at pointerdown during an active scrub
        // to avoid getBoundingClientRect on every pointermove (layout cost).
        const rect = scrubRectRef.current ?? track.getBoundingClientRect()
        if (rect.width <= 0) return 0
        return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    }

    const seekToRatio = (ratio: number) => {
        const v = videoRef.current
        if (!v || durationSeconds <= 0) return
        const nextTime = Math.min(durationSeconds, Math.max(0, ratio * durationSeconds))
        v.currentTime = nextTime
        // Our own seek glides (or follows the finger) — not a jump to snap.
        // Read the position back: Chrome keeps it to the microsecond, so a
        // stored 7.7584001 would make the reported 7.7584 look like a jump.
        reportedTimeRef.current = v.currentTime
        setCurrentTime(nextTime)
    }

    const updateProgressHover = (clientX: number) => {
        if (durationSeconds <= 0) {
            setHoverTime(null)
            setHoverPercent(0)
            return
        }

        const ratio = getProgressRatioFromClientX(clientX)
        setHoverTime(ratio * durationSeconds)
        setHoverPercent(ratio)
    }

    const handleProgressPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        e.stopPropagation()
        e.preventDefault()
        // Behind a thumbnail the video knows nothing until warm-up — this
        // very tap starts it. The tap used to be lost (only a second one
        // seeked); now the spot is kept until the length is known.
        const v = videoRef.current
        // Only while the length is still coming: a stream whose length is
        // known to be endless never sends one, and the spot would hang forever
        const waitsForLength = durationSeconds <= 0 && !!v && !!v.getAttribute("src") && !v.error &&
            v.readyState < HTMLMediaElement.HAVE_METADATA
        if (durationSeconds <= 0 && !waitsForLength) return
        if (hideTimer.current) clearTimeout(hideTimer.current)
        e.currentTarget.setPointerCapture?.(e.pointerId)
        // Cache the track rect for the lifetime of this scrub gesture
        scrubRectRef.current = e.currentTarget.getBoundingClientRect()
        const ratio = getProgressRatioFromClientX(e.clientX)
        isScrubbingRef.current = true
        setIsScrubbing(true)
        setControlsVisible(true)
        if (waitsForLength) {
            setPendingSeek(ratio)
            return
        }
        setHoverTime(ratio * durationSeconds)
        setHoverPercent(ratio)
        seekToRatio(ratio)
    }

    const handleProgressPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        e.stopPropagation()
        e.preventDefault()
        if (durationSeconds <= 0) {
            if (isScrubbingRef.current && pendingSeek !== null) setPendingSeek(getProgressRatioFromClientX(e.clientX))
            return
        }
        updateProgressHover(e.clientX)
        if (isScrubbingRef.current) seekToRatio(getProgressRatioFromClientX(e.clientX))
    }

    const handleProgressPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
        e.stopPropagation()
        e.preventDefault()
        if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId)
        }
        scrubRectRef.current = null
        isScrubbingRef.current = false
        setIsScrubbing(false)
        if (isPlaying) scheduleHide()
    }

    const handleProgressPointerLeave = () => {
        if (!isScrubbingRef.current) setHoverTime(null)
    }

    const handleProgressKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
        if (durationSeconds <= 0) return

        let nextTime: number | null = null
        if (e.key === "ArrowLeft") nextTime = currentTime - 5
        if (e.key === "ArrowRight") nextTime = currentTime + 5
        if (e.key === "PageDown") nextTime = currentTime - 10
        if (e.key === "PageUp") nextTime = currentTime + 10
        if (e.key === "Home") nextTime = 0
        if (e.key === "End") nextTime = durationSeconds
        if (nextTime === null) return

        e.preventDefault()
        e.stopPropagation()
        const ratio = Math.min(1, Math.max(0, nextTime / durationSeconds))
        seekToRatio(ratio)
        setHoverTime(ratio * durationSeconds)
        setHoverPercent(ratio)
        if (keyTooltipTimer.current) clearTimeout(keyTooltipTimer.current)
        keyTooltipTimer.current = setTimeout(() => {
            keyTooltipTimer.current = null
            if (!isScrubbingRef.current) setHoverTime(null)
        }, 1000)
        // stopPropagation above keeps this from reaching the root key handler,
        // so reset the auto-hide timer here as well
        if (isPlaying) scheduleHide()
    }

    // Keyboard activity counts as activity just like mouse movement does
    const handleRootKeyDown = () => {
        if (!isPlaying) return
        scheduleHide()
    }

    const handleMouseMove = () => {
        if (!isPlaying) return
        // rAF-throttle: at most one scheduleHide() per frame, regardless of mouse-move frequency
        if (mouseMoveRafRef.current !== null) return
        mouseMoveRafRef.current = requestAnimationFrame(() => {
            mouseMoveRafRef.current = null
            scheduleHide()
        })
    }

    // Memoized button styles — keep object identity stable across renders
    // unless one of the visual props or the hover/active state actually changes.
    const baseButtonStyle = useMemo<CSSProperties>(() => ({
        appearance: "none",
        WebkitAppearance: "none",
        width: controlButtonSize,
        height: controlButtonSize,
        borderRadius: controlButtonRadius,
        border: `${controlButtonBorderWidth}px solid ${controlButtonBorderColor}`,
        background: controlButtonColor,
        backdropFilter: `saturate(160%) blur(${controlButtonBlur}px)`,
        WebkitBackdropFilter: `saturate(160%) blur(${controlButtonBlur}px)`,
        display: "grid",
        placeItems: "center",
        color: "white",
        font: "inherit",
        lineHeight: 0,
        cursor: "pointer",
        flexShrink: 0,
        minWidth: controlButtonSize,
        maxWidth: controlButtonSize,
        minHeight: controlButtonSize,
        maxHeight: controlButtonSize,
        margin: 0,
        padding: 0,
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
        isolation: "isolate",
        backgroundClip: "padding-box",
        outline: "none",
        transition: "transform 0.15s ease, background 0.15s, opacity 0.15s",
    }), [
        controlButtonSize,
        controlButtonRadius,
        controlButtonBorderWidth,
        controlButtonBorderColor,
        controlButtonColor,
        controlButtonBlur,
    ])

    const playButtonStyle = useMemo<CSSProperties>(() => ({
        ...baseButtonStyle,
        transform: playActive
            ? "scale(0.96)"
            : hoveredButton === "play" ? "scale(1.04)" : "scale(1)",
    }), [baseButtonStyle, hoveredButton, playActive])

    const muteButtonStyle = useMemo<CSSProperties>(() => ({
        ...baseButtonStyle,
        transform: hoveredButton === "mute" ? "scale(1.04)" : "scale(1)",
    }), [baseButtonStyle, hoveredButton])

    const expandButtonStyle = useMemo<CSSProperties>(() => ({
        ...baseButtonStyle,
        transform: hoveredButton === "expand" ? "scale(1.04)" : "scale(1)",
    }), [baseButtonStyle, hoveredButton])

    // Resolve the actual video source — file upload takes priority over URL.
    // Filter out unsafe URL schemes (javascript:, vbscript:, file:) before <video src>.
    const rawSrc = (sourceType === "upload" ? videoFile : videoUrl) || undefined
    const effectiveSrc = isSafeMediaUrl(rawSrc) ? rawSrc : undefined
    // Same scheme check for the thumbnail — it also renders user-provided input
    const thumbnailSrc = thumbnail?.src && isSafeMediaUrl(thumbnail.src) ? thumbnail.src : undefined

    const showThumbnail = !!thumbnailSrc && !frameShown
    const hasSource = !!effectiveSrc
    // The <video> downloads nothing until warm-up (see `preload` below)
    const holdsDownload = !!thumbnailSrc && !autoplay && !isStaticRenderer && !warmedUp

    // Phones have no hover to say Play may be next, so the tap itself paid
    // the whole cold start (Safari: up to ~1 s). On touch screens a player
    // that settles on screen warms up: half of it in view, or half the
    // screen's height filled across half its width or half the screen's
    // (a player taller or wider than two screens is never half in view) —
    // and holds still for 0.3 s.
    // Flicking or slowly scrolling past players warms none of them, and a
    // thumbnail still loading is waited for, its sharper copy included.
    useEffect(() => {
        const v = videoRef.current
        if (!v || !holdsDownload || typeof IntersectionObserver === "undefined") return
        if (!window.matchMedia?.("(hover: none)").matches) return
        let timer: ReturnType<typeof setTimeout> | null = null
        let stopWaiting: (() => void) | null = null
        const cancel = () => {
            if (timer) clearTimeout(timer)
            timer = null
            stopWaiting?.()
            stopWaiting = null
        }
        // The thumbnail goes first: on a slow connection the video would
        // take bandwidth from the picture the visitor sees. A cropped
        // thumbnail comes in two steps — once its shape is known, a sharper
        // copy follows (see measureThumb) — so each time a copy arrives,
        // look again a moment later and wait for the next one too.
        const waitForThumb = () => {
            const img = thumbRef.current
            if (!img || img.complete) {
                warmUp()
                return
            }
            const arrived = () => {
                stopWaiting?.()
                stopWaiting = null
                timer = setTimeout(waitForThumb, THUMB_RECHECK_MS)
            }
            img.addEventListener("load", arrived)
            img.addEventListener("error", arrived)
            stopWaiting = () => {
                img.removeEventListener("load", arrived)
                img.removeEventListener("error", arrived)
            }
        }
        // Time on screen alone isn't settling: a page scrolled slowly keeps
        // a player in view for longer than the delay. When the delay is up
        // the player must not have moved, or it waits another beat.
        const arm = () => {
            const start = v.getBoundingClientRect()
            timer = setTimeout(() => {
                const now = v.getBoundingClientRect()
                if (Math.abs(now.top - start.top) > 8 || Math.abs(now.left - start.left) > 8) {
                    arm()
                    return
                }
                waitForThumb()
            }, TOUCH_WARM_UP_MS)
        }
        const observer = new IntersectionObserver((entries) => {
            const entry = entries[entries.length - 1]
            const screenWidth = entry.rootBounds?.width ?? window.innerWidth
            const screenHeight = entry.rootBounds?.height ?? window.innerHeight
            // Height alone isn't enough: in a sideways carousel of tall
            // cards, the next card's edge fills the screen's height too.
            // Half the width must show as well: half the player's, or half
            // the screen's if that is less (a player over twice as wide as
            // the screen can never show half of its own).
            const settled = entry.isIntersecting && (
                entry.intersectionRatio >= 0.5 ||
                (entry.intersectionRect.height >= screenHeight / 2 &&
                    entry.intersectionRect.width >= Math.min(entry.boundingClientRect.width, screenWidth) / 2)
            )
            if (!settled) {
                cancel()
            } else if (!timer) {
                arm()
            }
        }, { threshold: TOUCH_WARM_UP_THRESHOLDS })
        observer.observe(v)
        return () => {
            observer.disconnect()
            cancel()
        }
    }, [holdsDownload])

    // `sizes` for the thumbnail. Without it the browser assumes the image
    // spans the whole window and takes a srcSet variant several times too
    // big — a 4K file for a 640px player on a retina laptop. The width only
    // grows: theater mode needs a sharper copy, shrinking back would fetch a
    // second one.
    // A pre-rendered page is left alone: the browser picked its variant for
    // the full window width while parsing (which covers theater mode too),
    // and a smaller hint now would only add a second download.
    const measuresThumb = !hydrated && typeof ResizeObserver !== "undefined"
    // Width ÷ height of the picture, known once a variant has loaded
    const thumbAspectRef = useRef(0)
    // While playback gets going the thumbnail only stands in until the first
    // frame, so it asks for no sharper copy: that download took bandwidth
    // from the video start (a cropped thumbnail, autoplay, theater opened
    // right after Play) and delayed it by 1-4 s on a slow line
    const thumbFrozenRef = useRef(false)
    useIsomorphicLayoutEffect(() => {
        thumbFrozenRef.current = isPlaying
    }, [isPlaying])
    const measureThumb = useCallback(() => {
        const img = thumbRef.current
        if (!img) return
        // Layout size, not getBoundingClientRect(): a scale on an ancestor
        // (Framer appear effects) would shrink the measure — at scale(0) to
        // nothing, and no thumbnail would ever load
        const w = img.offsetWidth
        const h = img.offsetHeight
        // object-fit: cover scales a picture wider than the frame to the
        // frame's height and crops the sides (a 16:9 thumbnail in a 9:16
        // player), so it is drawn wider than the frame — size for that
        const aspect = thumbAspectRef.current
        const drawn = aspect > 0 && h * aspect > w * 1.02 ? Math.ceil(h * aspect) : w
        if (drawn > 0) setThumbWidth((prev) => (prev > 0 && thumbFrozenRef.current ? prev : Math.max(prev, drawn)))
    }, [])
    useIsomorphicLayoutEffect(() => {
        const img = thumbRef.current
        if (!measuresThumb || !img) return
        measureThumb()
        const observer = new ResizeObserver(measureThumb)
        observer.observe(img)
        return () => observer.disconnect()
    }, [measuresThumb, showThumbnail, measureThumb])
    // Safari starts the download the moment `src` / `srcSet` land, so they
    // wait for the first measurement (a synchronous re-render, before paint).
    // A player that has no width yet (hidden) loads its thumbnail once shown.
    // Thumbnails without a srcSet are measured too, so one that gains a
    // srcSet later isn't cleared while it waits.
    const holdThumb = measuresThumb && !!thumbnail?.srcSet && thumbWidth === 0

    const borderColor = `rgba(255,255,255,${borderOpacity})`
    // Static renders (canvas, export) always show the controls
    const controlsAreVisible = isStaticRenderer || !autoHideControls || controlsVisible
    const barAlpha = controlsAreVisible ? 1 : 0
    const innerRadius = Math.max(0, borderRadius - padding)
    const progress = durationSeconds > 0
        ? Math.min(1, Math.max(0, currentTime / durationSeconds))
        : pendingSeek ?? 0
    // Playing, a 0.12 s glide stood still for the rest of each 0.25 s gap
    // (half the frames frozen). The fill and the handle share one motion —
    // the handle used to glide differently from the fill on a paused seek.
    const progressMotion = isScrubbing || jumpedBack || currentTime < 0.15
        ? null
        : isPlaying ? PROGRESS_PLAYING_GLIDE : "0.2s ease"
    const progressLabel = durationSeconds > 0
        ? `${formatTime(currentTime)} / ${formatTime(durationSeconds)}`
        : "--:--"
    const showProgressTooltip = hoverTime !== null && durationSeconds > 0
    const progressTooltipPercent = Math.min(98, Math.max(2, hoverPercent * 100))

    const frame = (
        <div
            ref={rootRef}
            style={{
                display: "flex",
                flexDirection: "column",
                boxSizing: "border-box",
                userSelect: "none",
                // Framer injects position/width/height here
                ...style,
                // Theater mode overrides geometry
                ...(theaterStyle ?? {}),
                // Visual properties last — always win over Framer's injected styles
                borderRadius,
                border: `1px solid ${borderColor}`,
                background: backgroundColor,
                backdropFilter: `blur(${blurAmount}px)`,
                WebkitBackdropFilter: `blur(${blurAmount}px)`,
                boxShadow: "0 8px 40px rgba(0,0,0,0.22)",
                overflow: "hidden",
                padding,
            }}
            onMouseMove={handleMouseMove}
            onKeyDown={handleRootKeyDown}
            // Capture phase: the progress bar stops its pointerdown from
            // bubbling
            onPointerDownCapture={warmUp}
            onPointerMove={handlePointerMoveWarmUp}
            onPointerLeave={() => { lastPointerRef.current = null }}
            onFocus={warmUp}
        >
            {/* Inner video frame.
                aspectRatio gives it a natural height in Framer "Fit" mode.
                flex: "1 1 auto" lets it expand in fixed-height mode (flex overrides ratio). */}
            <div
                style={{
                    flex: "1 1 auto",
                    aspectRatio: aspectRatio.replace(":", "/"),
                    minHeight: 0,
                    borderRadius: innerRadius,
                    overflow: "hidden",
                    position: "relative",
                    cursor: "pointer",
                }}
                onClick={togglePlay}
            >
                <video
                    ref={videoRef}
                    src={effectiveSrc}
                    muted={isMuted}
                    loop={loop}
                    playsInline
                    // Behind a thumbnail nothing is seen until Play, yet
                    // "metadata" still pulled the first seconds of video
                    // (2+ MB in Chrome) for every player on page load.
                    // Without a thumbnail Safari would show an empty frame,
                    // and autoplay needs the data — both still load up front,
                    // as does the canvas, so a broken URL shows right away.
                    preload={holdsDownload ? "none" : "metadata"}
                    style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: isExpanded ? "contain" : objectFit,
                        background: "rgba(0,0,0,0.08)",
                    }}
                    onLoadedMetadata={() => {
                        const v = videoRef.current
                        if (!v) return
                        const duration = isFinite(v.duration) ? v.duration : 0
                        setDurationSeconds(duration)
                        // A spot tapped on the bar before the length was known
                        if (pendingSeek !== null && duration > 0) {
                            v.currentTime = pendingSeek * duration
                            reportedTimeRef.current = v.currentTime
                        }
                        setPendingSeek(null)
                        setCurrentTime(v.currentTime)
                    }}
                    onTimeUpdate={() => {
                        const v = videoRef.current
                        if (!v) return
                        // A jump is a real step back (a loop restart is the whole
                        // video) — not a browser rounding a seek to a frame
                        setJumpedBack(v.currentTime < reportedTimeRef.current - PROGRESS_JUMP_BACK_S)
                        reportedTimeRef.current = v.currentTime
                        setCurrentTime(v.currentTime)
                        // Time moving on means frames are being drawn —
                        // covers players no frame callback reports on
                        // (iOS native fullscreen, older browsers)
                        const from = playingFromRef.current
                        if (from !== null && !v.paused && v.currentTime > from) setFrameShown(true)
                    }}
                    // Keep React state synced with the <video> element so play/pause
                    // toggled from native iOS fullscreen controls or browser UI is reflected here.
                    onPlay={() => {
                        // Whoever started it, autoplay is done and nothing
                        // waits to be resumed — a later pause stays put.
                        // Unless the event is stale: on a busy page a "play"
                        // can arrive after the observer has paused again, and
                        // clearing then would leave the video stuck on screen.
                        if (videoRef.current && !videoRef.current.paused) {
                            autoplayPendingRef.current = false
                            pausedOffscreenRef.current = false
                        }
                        const resumed = resumingRef.current
                        resumingRef.current = false
                        // Started without the data to go on (a cold start)
                        if (videoRef.current && videoRef.current.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
                            setIsWaiting(true)
                        }
                        setIsPlaying(true)
                        // Back on screen with the controls hidden: keep them so
                        if (!(resumed && !controlsVisible)) scheduleHide()
                    }}
                    onWaiting={() => {
                        if (videoRef.current && !videoRef.current.paused) setIsWaiting(true)
                    }}
                    // Playback has really started: the thumbnail goes once
                    // a frame is painted. requestVideoFrameCallback reports
                    // exactly that; without it the frame is up by the next paint.
                    onPlaying={() => {
                        setIsWaiting(false)
                        const v = videoRef.current as FrameCallbackVideo | null
                        if (!v || frameShown) return
                        playingFromRef.current = v.currentTime
                        if (typeof v.requestVideoFrameCallback === "function") {
                            v.requestVideoFrameCallback(() => setFrameShown(true))
                        } else {
                            requestAnimationFrame(() => setFrameShown(true))
                        }
                    }}
                    // A reload (retry, new source) clears the picture
                    onEmptied={() => {
                        playingFromRef.current = null
                        setFrameShown(false)
                    }}
                    onPause={() => {
                        setIsPlaying(false)
                        setIsWaiting(false)
                        // Paused for scrolling out of view: nobody is looking
                        if (ownPausesRef.current > 0) {
                            ownPausesRef.current -= 1
                            return
                        }
                        revealControls()
                    }}
                    onEnded={() => { setIsPlaying(false); setIsWaiting(false); revealControls() }}
                    // Native fullscreen controls and media keys can mute/unmute
                    // behind our back — mirror the element so the icon stays truthful.
                    onVolumeChange={() => {
                        if (!videoRef.current) return
                        // Sound turned on from outside: autoplay's mute is over
                        if (!videoRef.current.muted) autoMutedRef.current = false
                        setIsMuted(videoRef.current.muted)
                    }}
                    // Safari keeps the element "playing" after a failed load and
                    // fires no pause event — reset here so the Play icon and the
                    // controls come back (auto-hide would otherwise keep them hidden).
                    onError={() => {
                        setLoadError(true)
                        setIsPlaying(false)
                        setIsWaiting(false)
                        // A spot tapped before the failure: the bar goes back to
                        // the start, and a retry starts there too
                        setPendingSeek(null)
                        revealControls()
                    }}
                />

                {showThumbnail && thumbnailSrc && (
                    <img
                        ref={thumbRef}
                        // sizes before srcSet before src: each lands with
                        // the previous one already in place
                        sizes={thumbWidth > 0 ? `${thumbWidth}px` : undefined}
                        srcSet={holdThumb ? undefined : thumbnail?.srcSet}
                        src={holdThumb ? undefined : thumbnailSrc}
                        decoding="async"
                        onLoad={(e) => {
                            if (!measuresThumb) return
                            const { naturalWidth, naturalHeight } = e.currentTarget
                            if (naturalWidth > 0 && naturalHeight > 0) {
                                thumbAspectRef.current = naturalWidth / naturalHeight
                                measureThumb()
                            }
                        }}
                        alt={thumbnail?.alt ?? ""}
                        style={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            pointerEvents: "none",
                        }}
                    />
                )}

                {/* Loading: a spinner in the look of the control buttons.
                    The live region stays in place so screen readers hear it. */}
                <div
                    role="status"
                    style={{
                        position: "absolute",
                        inset: 0,
                        display: "grid",
                        placeItems: "center",
                        pointerEvents: "none",
                        zIndex: 1,
                    }}
                >
                    {/* No video, nothing to wait for: Play on an empty player
                        would have spun forever */}
                    {showSpinner && hasSource && (
                        <span
                            style={{
                                display: "grid",
                                placeItems: "center",
                                width: controlButtonSize,
                                height: controlButtonSize,
                                borderRadius: controlButtonRadius,
                                border: `${controlButtonBorderWidth}px solid ${controlButtonBorderColor}`,
                                background: controlButtonColor,
                                backdropFilter: `saturate(160%) blur(${controlButtonBlur}px)`,
                                WebkitBackdropFilter: `saturate(160%) blur(${controlButtonBlur}px)`,
                                boxSizing: "border-box",
                                color: "white",
                                lineHeight: 0,
                            }}
                        >
                            <IconSpinner slow={prefersReducedMotion()} />
                            <span style={visuallyHiddenStyle}>Loading video</span>
                        </span>
                    )}
                </div>

                {!hasSource && !thumbnailSrc && (
                    <div style={{
                        position: "absolute", inset: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: "rgba(0,0,0,0.18)",
                    }}>
                        <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, fontFamily: "sans-serif" }}>
                            {sourceType === "upload"
                                ? "Upload a video file in properties"
                                : "Add a video URL in properties"}
                        </span>
                    </div>
                )}

                {hasSource && loadError && (
                    <div style={{
                        position: "absolute", inset: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: "rgba(0,0,0,0.45)",
                    }}>
                        <span style={{ color: "rgba(255,255,255,0.9)", fontSize: 13, fontFamily: "sans-serif" }}>
                            Couldn't load video
                        </span>
                    </div>
                )}

                {/* Controls row overlays the video, so outer padding stays even on all sides. */}
                <div
                    onFocus={(e) => {
                        if (!isKeyboardFocus(e.target)) return
                        focusWithinControlsRef.current = true
                        revealControls()
                    }}
                    onBlur={(e) => {
                        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
                        focusWithinControlsRef.current = false
                        if (isPlaying) scheduleHide()
                    }}
                    style={{
                        position: "absolute",
                        left: padding,
                        right: padding,
                        bottom: padding,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        // Hidden controls only fade out: they stay in the tab
                        // order and for screen readers, so an autoplaying video
                        // can always be paused (WCAG 2.2.2). Tabbing in brings
                        // them back.
                        opacity: barAlpha,
                        transition: "opacity 0.3s",
                        zIndex: 2,
                        pointerEvents: controlsAreVisible ? "auto" : "none",
                    }}
                >
                    {/* Play / Pause */}
                    <ControlBtn
                        ariaLabel={isPlaying ? "Pause" : "Play"}
                        onClick={(e) => { e.stopPropagation(); togglePlay() }}
                        onMouseEnter={() => setHoveredButton("play")}
                        onMouseLeave={() => { setHoveredButton(null); setPlayActive(false) }}
                        onMouseDown={() => setPlayActive(true)}
                        onMouseUp={() => setPlayActive(false)}
                        buttonStyle={playButtonStyle}
                    >
                        {isPlaying ? <IconPause /> : <IconPlay />}
                    </ControlBtn>

                    {/* Progress */}
                    <div
                        ref={progressRef}
                        role="slider"
                        tabIndex={0}
                        aria-label="Video progress"
                        aria-valuemin={0}
                        aria-valuemax={Math.round(durationSeconds)}
                        aria-valuenow={Math.round(currentTime)}
                        aria-valuetext={progressLabel}
                        onPointerDown={handleProgressPointerDown}
                        onPointerMove={handleProgressPointerMove}
                        onPointerUp={handleProgressPointerUp}
                        onPointerCancel={handleProgressPointerUp}
                        onPointerLeave={handleProgressPointerLeave}
                        onKeyDown={handleProgressKeyDown}
                        onClick={(e) => e.stopPropagation()}
                        onFocus={(e) => setProgressFocused(isKeyboardFocus(e.target))}
                        onBlur={() => {
                            setProgressFocused(false)
                            if (keyTooltipTimer.current) clearTimeout(keyTooltipTimer.current)
                            if (!isScrubbingRef.current) setHoverTime(null)
                        }}
                        style={{
                            position: "relative",
                            flex: "1 1 auto",
                            minWidth: 48,
                            height: controlButtonSize,
                            display: "flex",
                            alignItems: "center",
                            cursor: durationSeconds > 0 ? "pointer" : "default",
                            touchAction: "none",
                            outline: "none",
                        }}
                    >
                        {showProgressTooltip && (
                            <span
                                style={{
                                    position: "absolute",
                                    left: `${progressTooltipPercent}%`,
                                    top: -18,
                                    transform: "translateX(-50%)",
                                    padding: "3px 7px",
                                    borderRadius: 999,
                                    background: "rgba(0,0,0,0.72)",
                                    color: "white",
                                    fontSize: 11,
                                    fontWeight: 500,
                                    lineHeight: 1,
                                    fontFamily: "inherit",
                                    whiteSpace: "nowrap",
                                    pointerEvents: "none",
                                    zIndex: 3,
                                }}
                            >
                                {formatTime(hoverTime ?? 0)}
                            </span>
                        )}
                        <span
                            style={{
                                position: "relative",
                                display: "block",
                                width: "100%",
                                height: PROGRESS_THUMB_HEIGHT,
                            }}
                        >
                            <span
                                style={{
                                    position: "absolute",
                                    left: 0,
                                    right: 0,
                                    top: (PROGRESS_THUMB_HEIGHT - PROGRESS_TRACK_HEIGHT) / 2,
                                    height: PROGRESS_TRACK_HEIGHT,
                                    background: "rgba(255,255,255,0.18)",
                                    borderRadius: 999,
                                }}
                            />
                            <span
                                style={{
                                    position: "absolute",
                                    left: 0,
                                    top: (PROGRESS_THUMB_HEIGHT - PROGRESS_TRACK_HEIGHT) / 2,
                                    width: `${progress * 100}%`,
                                    height: PROGRESS_TRACK_HEIGHT,
                                    background: progressColor,
                                    borderRadius: 999,
                                    transition: progressMotion ? `width ${progressMotion}` : "none",
                                }}
                            />
                            <span
                                style={{
                                    position: "absolute",
                                    left: `${progress * 100}%`,
                                    top: 0,
                                    width: PROGRESS_THUMB_WIDTH,
                                    height: PROGRESS_THUMB_HEIGHT,
                                    borderRadius: PROGRESS_THUMB_RADIUS,
                                    background: "white",
                                    transform: "translateX(-50%)",
                                    boxShadow: progressFocused
                                        ? "0 1px 4px rgba(0,0,0,0.18), 0 0 0 2px rgba(255,255,255,0.9)"
                                        : "0 1px 4px rgba(0,0,0,0.18)",
                                    transition: progressMotion ? `left ${progressMotion}` : "none",
                                }}
                            />
                        </span>
                    </div>

                    {/* Mute */}
                    <ControlBtn
                        ariaLabel={isMuted ? "Unmute" : "Mute"}
                        onClick={toggleMute}
                        onMouseEnter={() => setHoveredButton("mute")}
                        onMouseLeave={() => setHoveredButton(null)}
                        buttonStyle={muteButtonStyle}
                    >
                        {isMuted ? <IconVolumeOff /> : <IconVolumeOn />}
                    </ControlBtn>

                    {/* Expand / Collapse */}
                    <ControlBtn
                        ariaLabel={isExpanded ? "Exit theater mode" : "Theater mode"}
                        onClick={toggleExpand}
                        onMouseEnter={() => setHoveredButton("expand")}
                        onMouseLeave={() => setHoveredButton(null)}
                        buttonStyle={expandButtonStyle}
                    >
                        {isExpanded ? <IconCollapse /> : <IconExpand />}
                    </ControlBtn>
                </div>
            </div>
        </div>
    )

    // While the theater is open the frame is out of the page's flow. This
    // invisible copy of its box holds the spot — without it a "Fit" height
    // collapses and the content below jumps up, then back down on close.
    const placeholder = theaterStyle && (
        <div
            ref={placeholderRef}
            aria-hidden="true"
            style={{
                display: "flex",
                flexDirection: "column",
                boxSizing: "border-box",
                ...style,
                border: "1px solid transparent",
                overflow: "hidden",
                padding,
                visibility: "hidden",
                pointerEvents: "none",
            }}
        >
            <div
                style={{
                    flex: "1 1 auto",
                    aspectRatio: aspectRatio.replace(":", "/"),
                    minHeight: 0,
                }}
            />
        </div>
    )

    return (
        <>
            {frame}
            {placeholder}
        </>
    )
}

// Property controls are grouped logically in the panel by listing order:
// 1) Source — what video is shown
// 2) Frame size — aspect + fit
// 3) Playback — behavior toggles
// 4) Frame look — glass-frame styling
// 5) Controls — button + progress styling
addPropertyControls(TheaterVideoPlayer, {
    // —— Source ——
    sourceType: {
        type: ControlType.Enum,
        title: "Source",
        options: ["url", "upload"],
        optionTitles: ["URL", "Upload"],
        defaultValue: "url",
        displaySegmentedControl: true,
    },
    videoUrl: {
        type: ControlType.String,
        title: "Video URL",
        placeholder: "https://your-cdn.com/video.mp4",
        hidden: (props: Props) => props.sourceType !== "url",
    },
    videoFile: {
        type: ControlType.File,
        title: "File",
        allowedFileTypes: ["mp4", "webm", "mov", "m4v", "ogv"],
        hidden: (props: Props) => props.sourceType !== "upload",
    },
    thumbnail: {
        type: ControlType.ResponsiveImage,
        title: "Thumbnail",
        description: "Shown before the video first plays.",
    },
    // —— Frame size ——
    aspectRatio: {
        type: ControlType.Enum,
        title: "Aspect",
        options: ["16:9", "9:16", "1:1", "4:5"],
        optionTitles: ["16:9", "9:16", "1:1", "4:5"],
        defaultValue: "16:9",
        displaySegmentedControl: true,
        description: "Video frame ratio. Use 9:16 for vertical, 1:1 for square.",
    },
    objectFit: {
        type: ControlType.Enum,
        title: "Fit",
        options: ["cover", "contain"],
        optionTitles: ["Cover", "Contain"],
        defaultValue: "cover",
        displaySegmentedControl: true,
        description: "How the video fills its frame. Theater mode always uses Contain.",
    },
    // —— Playback ——
    loop: {
        type: ControlType.Boolean,
        title: "Loop",
        defaultValue: true,
        enabledTitle: "On",
        disabledTitle: "Off",
    },
    mutedByDefault: {
        type: ControlType.Boolean,
        title: "Muted",
        defaultValue: true,
        enabledTitle: "On",
        disabledTitle: "Off",
        description: "Sound when a visitor presses Play. Autoplay always starts muted.",
    },
    autoplay: {
        type: ControlType.Boolean,
        title: "Autoplay",
        defaultValue: false,
        enabledTitle: "On",
        disabledTitle: "Off",
        description: "Plays muted while the player is on screen.",
    },
    autoHideControls: {
        type: ControlType.Boolean,
        title: "Auto Hide",
        defaultValue: false,
        enabledTitle: "On",
        disabledTitle: "Off",
        description: "Hide controls after 2.2s of inactivity while playing.",
    },
    // —— Frame look ——
    padding: {
        type: ControlType.Number,
        title: "Padding",
        min: 0,
        max: 24,
        step: 1,
        defaultValue: 8,
        unit: "px",
        description: "Inner space of the glass frame around the video.",
    },
    borderRadius: {
        type: ControlType.Number,
        title: "Border Radius",
        min: 0,
        max: 40,
        step: 1,
        defaultValue: 16,
        unit: "px",
    },
    borderOpacity: {
        type: ControlType.Number,
        title: "Border Opacity",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.3,
        description: "Strength of the frame edge line: 0 (none) to 1 (solid).",
    },
    backgroundColor: {
        type: ControlType.Color,
        title: "BG Color",
        defaultValue: "rgba(255, 255, 255, 0.12)",
        description: "Tint behind the glass frame. Lower alpha = more transparent.",
    },
    blurAmount: {
        type: ControlType.Number,
        title: "Blur",
        min: 0,
        max: 40,
        step: 1,
        defaultValue: 20,
        unit: "px",
        description: "Backdrop blur for the glass frame.",
    },
    // —— Controls ——
    controlButtonSize: {
        type: ControlType.Number,
        title: "Button Size",
        min: 24,
        max: 64,
        step: 1,
        defaultValue: DEFAULT_CONTROL_BUTTON_SIZE,
        unit: "px",
        description: "Size of the play, mute, and theater buttons.",
    },
    controlButtonRadius: {
        type: ControlType.Number,
        title: "Button Radius",
        min: 0,
        max: 32,
        step: 1,
        defaultValue: DEFAULT_CONTROL_BUTTON_RADIUS,
        unit: "px",
        description: "Corner radius for control buttons.",
    },
    controlButtonColor: {
        type: ControlType.Color,
        title: "Button Color",
        defaultValue: "rgba(255, 255, 255, 0.1)",
        description: "Background fill of each control button.",
    },
    controlButtonBorderColor: {
        type: ControlType.Color,
        title: "Stroke Color",
        defaultValue: "rgba(255, 255, 255, 0.16)",
        description: "Border color around each control button.",
    },
    controlButtonBorderWidth: {
        type: ControlType.Number,
        title: "Stroke Width",
        min: 0,
        max: 3,
        step: 0.5,
        defaultValue: 1,
        unit: "px",
        description: "Border thickness around each control button.",
    },
    controlButtonBlur: {
        type: ControlType.Number,
        title: "Button Blur",
        min: 0,
        max: 20,
        step: 1,
        defaultValue: DEFAULT_CONTROL_BUTTON_BLUR,
        unit: "px",
        description: "Backdrop blur strength behind each control button.",
    },
    progressColor: {
        type: ControlType.Color,
        title: "Progress Color",
        defaultValue: "#FFFFFF",
        description: "Color of the played portion of the progress bar.",
    },
})
