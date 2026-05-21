/**
 * VideoPlayer — Framer code component
 *
 * Glassmorphism video player with URL/upload sources, native mobile fullscreen,
 * animated theater mode, keyboard-accessible custom controls, and full
 * Framer Property Controls.
 *
 * Version: 1.0.0
 * License: MIT
 */

import { addPropertyControls, ControlType } from "framer"
import {
    useState,
    useRef,
    useEffect,
    type CSSProperties,
    type KeyboardEvent as ReactKeyboardEvent,
    type MouseEvent as ReactMouseEvent,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
} from "react"

export interface Props {
    sourceType: "url" | "upload"
    videoUrl: string
    videoFile: string
    thumbnailUrl: string
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

const VIDEO_ASPECT = 16 / 9
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

function getTheaterStyle(framePadding: number, transition = "none"): CSSProperties {
    if (typeof window === "undefined") return {}
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const margin = getTheaterMargin(viewportWidth)
    const maxWidth = Math.max(0, viewportWidth - margin * 2)
    const maxHeight = Math.max(0, viewportHeight - margin * 2)
    const maxVideoWidth = Math.max(0, maxWidth - framePadding * 2)
    const maxVideoHeight = Math.max(0, maxHeight - framePadding * 2)
    const videoWidth = Math.min(maxVideoWidth, maxVideoHeight * VIDEO_ASPECT)
    const videoHeight = videoWidth / VIDEO_ASPECT
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

type ControlActivateEvent = ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLElement>

// Reusable icon control for controls row
function ControlBtn({ ariaLabel, onClick, onMouseEnter, onMouseLeave, onMouseDown, onMouseUp, buttonStyle, children }: {
    ariaLabel: string
    onClick: (e: ControlActivateEvent) => void
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
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any-prefer-fixed
 * @framerIntrinsicWidth 640
 * @framerIntrinsicHeight 360
 */
export default function VideoPlayer({
    sourceType = "url",
    videoUrl = "",
    videoFile = "",
    thumbnailUrl = "",
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
    progressColor = "#000000",
    style,
}: Props) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const rootRef = useRef<HTMLDivElement>(null)
    const progressRef = useRef<HTMLDivElement>(null)
    const isScrubbingRef = useRef(false)
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const smallRect = useRef<DOMRect | null>(null)
    const nativeFsCleanup = useRef<(() => void) | null>(null)

    const [isPlaying, setIsPlaying] = useState(false)
    const [isMuted, setIsMuted] = useState(mutedByDefault)
    const [durationSeconds, setDurationSeconds] = useState(0)
    const [currentTime, setCurrentTime] = useState(0)
    const [isScrubbing, setIsScrubbing] = useState(false)
    const [hoverTime, setHoverTime] = useState<number | null>(null)
    const [hoverPercent, setHoverPercent] = useState(0)
    const [controlsVisible, setControlsVisible] = useState(true)
    const [isExpanded, setIsExpanded] = useState(false)
    const [theaterStyle, setTheaterStyle] = useState<CSSProperties | null>(null)

    const [playHover, setPlayHover] = useState(false)
    const [playActive, setPlayActive] = useState(false)
    const [muteHover, setMuteHover] = useState(false)
    const [expandHover, setExpandHover] = useState(false)
    const [progressFocused, setProgressFocused] = useState(false)
    const [hasEverPlayed, setHasEverPlayed] = useState(false)
    const [loadError, setLoadError] = useState(false)

    const scheduleHide = () => {
        if (hideTimer.current) clearTimeout(hideTimer.current)
        setControlsVisible(true)
        if (!autoHideControls) return
        hideTimer.current = setTimeout(() => setControlsVisible(false), 2200)
    }

    useEffect(() => () => {
        if (hideTimer.current) clearTimeout(hideTimer.current)
        if (expandTimer.current) clearTimeout(expandTimer.current)
        if (nativeFsCleanup.current) nativeFsCleanup.current()
    }, [])

    useEffect(() => {
        if (autoHideControls) return
        if (hideTimer.current) clearTimeout(hideTimer.current)
        setControlsVisible(true)
    }, [autoHideControls])

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

    // Reset load error when source changes
    useEffect(() => {
        setLoadError(false)
    }, [sourceType, videoUrl, videoFile])

    const closeExpand = () => {
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
    }

    // Escape key to close theater mode
    useEffect(() => {
        if (!isExpanded) return
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeExpand() }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [isExpanded])

    useEffect(() => {
        if (!isExpanded) return
        let rafId: number | null = null
        const onResize = () => {
            if (expandTimer.current) return
            if (rafId !== null) return
            rafId = requestAnimationFrame(() => {
                rafId = null
                setTheaterStyle(getTheaterStyle(padding))
            })
        }
        window.addEventListener("resize", onResize)
        return () => {
            if (rafId !== null) cancelAnimationFrame(rafId)
            window.removeEventListener("resize", onResize)
        }
    }, [isExpanded, padding])

    const togglePlay = () => {
        const v = videoRef.current
        if (!v) return
        if (isPlaying) {
            v.pause()
            setIsPlaying(false)
            setControlsVisible(true)
            if (hideTimer.current) clearTimeout(hideTimer.current)
        } else {
            v.play()
            setIsPlaying(true)
            setHasEverPlayed(true)
            scheduleHide()
        }
    }

    const toggleMute = (e: ControlActivateEvent) => {
        e.stopPropagation()
        const v = videoRef.current
        if (!v) return
        v.muted = !isMuted
        setIsMuted(!isMuted)
    }

    const openNativeFullscreen = () => {
        const video = videoRef.current as NativeFullscreenVideo | null
        if (!video) return false

        setControlsVisible(true)
        if (hideTimer.current) clearTimeout(hideTimer.current)

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
    }

    const toggleExpand = (e: ControlActivateEvent) => {
        e.stopPropagation()
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
                            `top ${THEATER_OPEN_MS}ms ${THEATER_OPEN_EASE}, left ${THEATER_OPEN_MS}ms ${THEATER_OPEN_EASE}, width ${THEATER_OPEN_MS}ms ${THEATER_OPEN_EASE}, height ${THEATER_OPEN_MS}ms ${THEATER_OPEN_EASE}`
                        ))
                    })
                })
            } else {
                setTheaterStyle(getTheaterStyle(padding))
            }
            setIsExpanded(true)
        } else {
            closeExpand()
        }
        setControlsVisible(true)
    }

    const getProgressRatioFromClientX = (clientX: number) => {
        const track = progressRef.current
        if (!track || durationSeconds <= 0) return 0
        const rect = track.getBoundingClientRect()
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
        if (isPlaying) scheduleHide()
    }

    // Resolve the actual video source — file upload takes priority over URL
    const effectiveSrc = (sourceType === "upload" ? videoFile : videoUrl) || undefined

    const showThumbnail = thumbnailUrl !== "" && !hasEverPlayed
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
    const getControlButtonStyle = (hover: boolean, active = false): CSSProperties => {
        return {
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
            transform: active ? "scale(0.96)" : hover ? "scale(1.04)" : "scale(1)",
            transition: "transform 0.15s ease, background 0.15s, opacity 0.15s",
        }
    }

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
                    aspectRatio: "16/9",
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
                    onError={() => setLoadError(true)}
                />

                {showThumbnail && (
                    <div style={{
                        position: "absolute", inset: 0,
                        backgroundImage: `url("${thumbnailUrl.replace(/"/g, "%22")}")`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                    }} />
                )}

                {!hasSource && !thumbnailUrl && (
                    <div style={{
                        position: "absolute", inset: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: "rgba(0,0,0,0.18)",
                    }}>
                        <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, fontFamily: "sans-serif" }}>
                            Add a video URL in properties
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
                    style={{
                        position: "absolute",
                        left: padding,
                        right: padding,
                        bottom: padding,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
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
                        onMouseEnter={() => setPlayHover(true)}
                        onMouseLeave={() => { setPlayHover(false); setPlayActive(false) }}
                        onMouseDown={() => setPlayActive(true)}
                        onMouseUp={() => setPlayActive(false)}
                        buttonStyle={getControlButtonStyle(playHover, playActive)}
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
                        onClick={toggleMute}
                        onMouseEnter={() => setMuteHover(true)}
                        onMouseLeave={() => setMuteHover(false)}
                        buttonStyle={getControlButtonStyle(muteHover)}
                    >
                        {isMuted ? <IconVolumeOff /> : <IconVolumeOn />}
                    </ControlBtn>

                    {/* Expand / Collapse */}
                    <ControlBtn
                        ariaLabel={isExpanded ? "Exit theater mode" : "Theater mode"}
                        onClick={toggleExpand}
                        onMouseEnter={() => setExpandHover(true)}
                        onMouseLeave={() => setExpandHover(false)}
                        buttonStyle={getControlButtonStyle(expandHover)}
                    >
                        {isExpanded ? <IconCollapse /> : <IconExpand />}
                    </ControlBtn>
                </div>
            </div>
        </div>
    )
}

addPropertyControls(VideoPlayer, {
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
    thumbnailUrl: {
        type: ControlType.Image,
        title: "Thumbnail",
        description: "Shown before the video first plays.",
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
    padding: {
        type: ControlType.Number,
        title: "Padding",
        min: 0,
        max: 24,
        step: 1,
        defaultValue: 8,
        unit: "px",
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
    controlButtonSize: {
        type: ControlType.Number,
        title: "Button Size",
        min: 24,
        max: 64,
        step: 1,
        defaultValue: DEFAULT_CONTROL_BUTTON_SIZE,
        unit: "px",
    },
    controlButtonRadius: {
        type: ControlType.Number,
        title: "Button Radius",
        min: 0,
        max: 32,
        step: 1,
        defaultValue: DEFAULT_CONTROL_BUTTON_RADIUS,
        unit: "px",
    },
    controlButtonColor: {
        type: ControlType.Color,
        title: "Button Color",
        defaultValue: "rgba(255, 255, 255, 0.1)",
    },
    controlButtonBorderColor: {
        type: ControlType.Color,
        title: "Stroke Color",
        defaultValue: "rgba(255, 255, 255, 0.16)",
    },
    controlButtonBorderWidth: {
        type: ControlType.Number,
        title: "Stroke Width",
        min: 0,
        max: 3,
        step: 0.5,
        defaultValue: 1,
        unit: "px",
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
        defaultValue: "#000000",
    },
})
