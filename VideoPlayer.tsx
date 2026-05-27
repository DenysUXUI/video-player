/**
 * FrostedPlayer — Framer code component
 *
 * Glassmorphism video player with URL/upload sources, native mobile fullscreen,
 * animated theater mode, keyboard-accessible custom controls, and full
 * Framer Property Controls.
 *
 * Icons inspired by Feather Icons (MIT) — https://feathericons.com
 *
 * License: MIT
 */

import { addPropertyControls, ControlType } from "framer"
import {
    useState,
    useRef,
    useEffect,
    useCallback,
    useMemo,
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

export interface Props {
    sourceType: "url" | "upload"
    videoUrl: string
    videoFile: string
    thumbnail?: ThumbnailImage
    aspectRatio: "16:9" | "9:16" | "1:1" | "4:5"
    loop: boolean
    mutedByDefault: boolean
    objectFit: "cover" | "contain"
    autoplay: boolean
    autoHideControls: boolean
    padding: number
    borderRadius: number
    borderOpacity: number
    backgroundColor: string
    blurAmount: number
    controlButtonSize: number
    controlButtonRadius: number
    controlButtonColor: string
    controlButtonBorderColor: string
    controlButtonBorderWidth: number
    controlButtonBlur: number
    progressColor: string
    style?: CSSProperties
}

function formatTime(secs: number): string {
    if (!isFinite(secs) || secs < 0) return "--:--"
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s.toString().padStart(2, "0")}`
}

// Block dangerous URL schemes before passing user input to <video src>.
// Allows the normal cases (https, http, blob, data:video/*, framer uploads)
// and rejects javascript:, vbscript:, and file: which have no business in a media player.
function isSafeMediaUrl(url: string | undefined): boolean {
    if (!url) return false
    const trimmed = url.trim().toLowerCase()
    if (trimmed.startsWith("javascript:")) return false
    if (trimmed.startsWith("vbscript:")) return false
    if (trimmed.startsWith("file:")) return false
    return true
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
const THEATER_DESKTOP_MARGIN = 48
const THEATER_TABLET_MARGIN = 24
const THEATER_MOBILE_MARGIN = 20
const THEATER_OPEN_MS = 380
const THEATER_CLOSE_MS = 320
const THEATER_OPEN_EASE = "cubic-bezier(0.2, 0, 0, 1)"
const THEATER_CLOSE_EASE = "cubic-bezier(0.4, 0, 0.6, 1)"
const MOBILE_NATIVE_FULLSCREEN_MAX_WIDTH = 767

type NativeFullscreenVideo = HTMLVideoElement & {
    webkitEnterFullscreen?: () => void
    webkitDisplayingFullscreen?: boolean
}

function rectToFixedStyle(rect: DOMRect, transition = "none"): CSSProperties {
    return {
        position: "fixed",
        top: rect.top,
        left: rect.left,
        right: "auto",
        bottom: "auto",
        width: rect.width,
        height: rect.height,
        zIndex: 9999,
        transform: "none",
        willChange: "top, left, width, height",
        transition,
    }
}

function getTheaterMargin(viewportWidth: number) {
    if (viewportWidth <= 767) return THEATER_MOBILE_MARGIN
    if (viewportWidth <= 1199) return THEATER_TABLET_MARGIN
    return THEATER_DESKTOP_MARGIN
}

function shouldUseNativeMobileFullscreen() {
    if (typeof window === "undefined") return false
    return window.innerWidth <= MOBILE_NATIVE_FULLSCREEN_MAX_WIDTH
}

function prefersReducedMotion(): boolean {
    if (typeof window === "undefined" || !window.matchMedia) return false
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function getTheaterStyle(framePadding: number, aspect: number, transition = "none"): CSSProperties {
    if (typeof window === "undefined") return {}
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const margin = getTheaterMargin(viewportWidth)
    const maxWidth = Math.max(0, viewportWidth - margin * 2)
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
        zIndex: 9999,
        transform: "none",
        willChange: "top, left, width, height",
        transition,
    }
}

// Reusable icon control for controls row
function ControlBtn({ ariaLabel, ariaPressed, onClick, onMouseEnter, onMouseLeave, onMouseDown, onMouseUp, buttonStyle, children }: {
    ariaLabel: string
    ariaPressed?: boolean
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
            aria-pressed={ariaPressed}
            onClick={onClick}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
            onFocus={() => setFocused(true)}
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
    videoRef,
    padding,
    aspect,
    onActivate,
}: {
    rootRef: RefObject<HTMLDivElement>
    videoRef: RefObject<HTMLVideoElement>
    padding: number
    aspect: number
    onActivate: () => void
}) {
    const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const smallRect = useRef<DOMRect | null>(null)
    const nativeFsCleanup = useRef<(() => void) | null>(null)
    const [isExpanded, setIsExpanded] = useState(false)
    const [theaterStyle, setTheaterStyle] = useState<CSSProperties | null>(null)

    // Clean up timers and any active native-fullscreen listeners on unmount
    useEffect(() => () => {
        if (expandTimer.current) clearTimeout(expandTimer.current)
        if (nativeFsCleanup.current) nativeFsCleanup.current()
    }, [])

    const closeExpand = useCallback(() => {
        if (expandTimer.current) clearTimeout(expandTimer.current)
        const current = rootRef.current?.getBoundingClientRect()
        const small = smallRect.current
        if (!current || !small || prefersReducedMotion()) {
            setIsExpanded(false)
            setTheaterStyle(null)
            return
        }

        setTheaterStyle(rectToFixedStyle(current))
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setTheaterStyle(rectToFixedStyle(
                    small,
                    `top ${THEATER_CLOSE_MS}ms ${THEATER_CLOSE_EASE}, left ${THEATER_CLOSE_MS}ms ${THEATER_CLOSE_EASE}, width ${THEATER_CLOSE_MS}ms ${THEATER_CLOSE_EASE}, height ${THEATER_CLOSE_MS}ms ${THEATER_CLOSE_EASE}`
                ))
            })
        })

        expandTimer.current = setTimeout(() => {
            setIsExpanded(false)
            setTheaterStyle(null)
            expandTimer.current = null
        }, THEATER_CLOSE_MS + 30)
    }, [rootRef])

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

    const openNativeFullscreen = useCallback(() => {
        const video = videoRef.current as NativeFullscreenVideo | null
        if (!video) return false

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
            return false
        }

        resetNativeControls()
        return false
    }, [videoRef])

    const toggleExpand = useCallback((e: ReactMouseEvent<HTMLButtonElement>) => {
        e.stopPropagation()
        onActivate()
        if (!isExpanded) {
            if (shouldUseNativeMobileFullscreen() && openNativeFullscreen()) return

            const rect = rootRef.current?.getBoundingClientRect() ?? null
            smallRect.current = rect
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
        } else {
            closeExpand()
        }
    }, [isExpanded, padding, aspect, rootRef, onActivate, openNativeFullscreen, closeExpand])

    return { isExpanded, theaterStyle, toggleExpand }
}

/**
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any-prefer-fixed
 * @framerIntrinsicWidth 640
 * @framerIntrinsicHeight 360
 */
export default function FrostedPlayer({
    sourceType = "url",
    videoUrl = "",
    videoFile = "",
    thumbnail,
    aspectRatio = "16:9",
    loop = true,
    mutedByDefault = true,
    objectFit = "cover",
    autoplay = false,
    autoHideControls = false,
    padding = 8,
    borderRadius = 16,
    borderOpacity = 0.3,
    backgroundColor = "rgba(255, 255, 255, 0.12)",
    blurAmount = 20,
    controlButtonSize = DEFAULT_CONTROL_BUTTON_SIZE,
    controlButtonRadius = DEFAULT_CONTROL_BUTTON_RADIUS,
    controlButtonColor = "rgba(255, 255, 255, 0.1)",
    controlButtonBorderColor = "rgba(255, 255, 255, 0.16)",
    controlButtonBorderWidth = 1,
    controlButtonBlur = DEFAULT_CONTROL_BUTTON_BLUR,
    progressColor = "#FFFFFF",
    style,
}: Props) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const rootRef = useRef<HTMLDivElement>(null)
    const progressRef = useRef<HTMLDivElement>(null)
    const isScrubbingRef = useRef(false)
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const mouseMoveRafRef = useRef<number | null>(null)
    const scrubRectRef = useRef<DOMRect | null>(null)

    const [isPlaying, setIsPlaying] = useState(false)
    const [isMuted, setIsMuted] = useState(mutedByDefault)
    const [durationSeconds, setDurationSeconds] = useState(0)
    const [currentTime, setCurrentTime] = useState(0)
    const [isScrubbing, setIsScrubbing] = useState(false)
    const [hoverTime, setHoverTime] = useState<number | null>(null)
    const [hoverPercent, setHoverPercent] = useState(0)
    const [controlsVisible, setControlsVisible] = useState(true)

    const [hoveredButton, setHoveredButton] = useState<"play" | "mute" | "expand" | null>(null)
    const [playActive, setPlayActive] = useState(false)
    const [progressFocused, setProgressFocused] = useState(false)
    const [hasEverPlayed, setHasEverPlayed] = useState(false)
    const [loadError, setLoadError] = useState(false)

    const scheduleHide = () => {
        if (hideTimer.current) clearTimeout(hideTimer.current)
        setControlsVisible(true)
        if (!autoHideControls) return
        hideTimer.current = setTimeout(() => setControlsVisible(false), 2200)
    }

    // Theater mode lives in its own hook (open/close, escape, resize, native FS)
    const handleTheaterActivate = useCallback(() => {
        setControlsVisible(true)
        if (hideTimer.current) clearTimeout(hideTimer.current)
    }, [])
    const aspect = parseAspectRatio(aspectRatio)
    const { isExpanded, theaterStyle, toggleExpand } = useTheaterMode({
        rootRef,
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
    }, [])

    useEffect(() => {
        if (autoHideControls) return
        if (hideTimer.current) clearTimeout(hideTimer.current)
        setControlsVisible(true)
    }, [autoHideControls])

    // Keep mute state in sync when the designer toggles the prop in Framer panel
    useEffect(() => {
        setIsMuted(mutedByDefault)
        if (videoRef.current) videoRef.current.muted = mutedByDefault
    }, [mutedByDefault])

    // Autoplay on mount / when source changes
    useEffect(() => {
        if (!autoplay) return
        const src = (sourceType === "upload" ? videoFile : videoUrl) || undefined
        if (!src) return
        videoRef.current?.play().then(() => {
            setIsPlaying(true)
            setHasEverPlayed(true)
            scheduleHide()
        }).catch(() => {})
    }, [autoplay, sourceType, videoFile, videoUrl, autoHideControls])

    // Reset playback + UI state when the source changes so a new video starts clean
    useEffect(() => {
        setLoadError(false)
        setHasEverPlayed(false)
        setIsPlaying(false)
        setCurrentTime(0)
        setDurationSeconds(0)
        setHoverTime(null)
        setHoverPercent(0)
    }, [sourceType, videoUrl, videoFile])

    const togglePlay = () => {
        const v = videoRef.current
        if (!v) return
        if (isPlaying) {
            v.pause()
            setIsPlaying(false)
            setControlsVisible(true)
            if (hideTimer.current) clearTimeout(hideTimer.current)
        } else {
            // Optimistic UI; roll back if the browser rejects play()
            // (iOS Safari rejects when there is no user gesture context)
            setIsPlaying(true)
            setHasEverPlayed(true)
            scheduleHide()
            const playPromise = v.play()
            if (playPromise && typeof playPromise.catch === "function") {
                playPromise.catch(() => setIsPlaying(false))
            }
        }
    }

    const toggleMute = (e: ReactMouseEvent<HTMLButtonElement>) => {
        e.stopPropagation()
        const v = videoRef.current
        if (!v) return
        v.muted = !isMuted
        setIsMuted(!isMuted)
    }

    const getProgressRatioFromClientX = (clientX: number) => {
        const track = progressRef.current
        if (!track || durationSeconds <= 0) return 0
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
        if (durationSeconds <= 0) return
        if (hideTimer.current) clearTimeout(hideTimer.current)
        e.currentTarget.setPointerCapture?.(e.pointerId)
        // Cache the track rect for the lifetime of this scrub gesture
        scrubRectRef.current = e.currentTarget.getBoundingClientRect()
        const ratio = getProgressRatioFromClientX(e.clientX)
        isScrubbingRef.current = true
        setIsScrubbing(true)
        setControlsVisible(true)
        setHoverTime(ratio * durationSeconds)
        setHoverPercent(ratio)
        seekToRatio(ratio)
    }

    const handleProgressPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        e.stopPropagation()
        e.preventDefault()
        if (durationSeconds <= 0) return
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

    const showThumbnail = !!thumbnail?.src && !hasEverPlayed
    const hasSource = !!effectiveSrc

    const borderColor = `rgba(255,255,255,${borderOpacity})`
    const controlsAreVisible = !autoHideControls || controlsVisible
    const barAlpha = controlsAreVisible ? 1 : 0
    const innerRadius = Math.max(0, borderRadius - padding)
    const progress = durationSeconds > 0
        ? Math.min(1, Math.max(0, currentTime / durationSeconds))
        : 0
    const progressTransition = currentTime < 0.15
        ? "none"
        : isPlaying ? "width 0.12s linear" : "width 0.2s ease"
    const progressLabel = durationSeconds > 0
        ? `${formatTime(currentTime)} / ${formatTime(durationSeconds)}`
        : "--:--"
    const showProgressTooltip = hoverTime !== null && durationSeconds > 0
    const progressTooltipPercent = Math.min(98, Math.max(2, hoverPercent * 100))

    return (
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
                    preload="metadata"
                    style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: isExpanded ? "contain" : objectFit,
                        background: "rgba(0,0,0,0.08)",
                    }}
                    onLoadedMetadata={() => {
                        if (!videoRef.current) return
                        setDurationSeconds(isFinite(videoRef.current.duration) ? videoRef.current.duration : 0)
                        setCurrentTime(videoRef.current.currentTime)
                    }}
                    onTimeUpdate={() => {
                        if (videoRef.current) setCurrentTime(videoRef.current.currentTime)
                    }}
                    // Keep React state synced with the <video> element so play/pause
                    // toggled from native iOS fullscreen controls or browser UI is reflected here.
                    onPlay={() => {
                        setIsPlaying(true)
                        setHasEverPlayed(true)
                    }}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                    onError={() => setLoadError(true)}
                />

                {showThumbnail && thumbnail && (
                    <img
                        src={thumbnail.src}
                        srcSet={thumbnail.srcSet}
                        alt={thumbnail.alt ?? ""}
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

                {!hasSource && !thumbnail?.src && (
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
                    aria-hidden={!controlsAreVisible}
                    style={{
                        position: "absolute",
                        left: padding,
                        right: padding,
                        bottom: padding,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        opacity: barAlpha,
                        // visibility removes the row from tab order + a11y tree;
                        // delay the flip until the fade-out finishes
                        visibility: controlsAreVisible ? "visible" : "hidden",
                        transition: controlsAreVisible
                            ? "opacity 0.3s, visibility 0s linear 0s"
                            : "opacity 0.3s, visibility 0s linear 0.3s",
                        zIndex: 2,
                        pointerEvents: controlsAreVisible ? "auto" : "none",
                    }}
                >
                    {/* Play / Pause */}
                    <ControlBtn
                        ariaLabel={isPlaying ? "Pause" : "Play"}
                        ariaPressed={isPlaying}
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
                        onFocus={() => setProgressFocused(true)}
                        onBlur={() => setProgressFocused(false)}
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
                                    transition: isScrubbing ? "none" : progressTransition,
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
                                    transition: isScrubbing ? "none" : "left 0.12s linear",
                                }}
                            />
                        </span>
                    </div>

                    {/* Mute */}
                    <ControlBtn
                        ariaLabel={isMuted ? "Unmute" : "Mute"}
                        ariaPressed={isMuted}
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
                        ariaPressed={isExpanded}
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
}

// Property controls are grouped logically in the panel by listing order:
// 1) Source — what video is shown
// 2) Frame size — aspect + fit
// 3) Playback — behavior toggles
// 4) Frame look — glass-frame styling
// 5) Controls — button + progress styling
addPropertyControls(FrostedPlayer, {
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
        description: "Initial mute state. Browsers block autoplay with sound.",
    },
    autoplay: {
        type: ControlType.Boolean,
        title: "Autoplay",
        defaultValue: false,
        enabledTitle: "On",
        disabledTitle: "Off",
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
