"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./remote.module.css";
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Maximize,
  LayoutGrid,
  Volume2,
  Volume1,
  Keyboard,
  Menu as MenuIcon,
  X,
  Copy,
} from "lucide-react";
import Link from "next/link";

const KEY_MAP: Readonly<Record<string, string>> = {
  Backspace: "KEY_BACKSPACE",
  Enter: "KEY_ENTER",
  NUMPAD_ENTER: "KEY_ENTER",
  Go: "KEY_ENTER",
  Search: "KEY_ENTER",
  Done: "KEY_ENTER",
  "\r": "KEY_ENTER",
  "\n": "KEY_ENTER",
  Shift: "KEY_LEFTSHIFT",
  Control: "KEY_LEFTCTRL",
  Alt: "KEY_LEFTALT",
  " ": "KEY_SPACE",
  ArrowLeft: "KEY_LEFT",
  ArrowRight: "KEY_RIGHT",
  ArrowUp: "KEY_UP",
  ArrowDown: "KEY_DOWN",
  Tab: "KEY_TAB",
  CapsLock: "KEY_CAPSLOCK",
  Escape: "KEY_ESC",
  F1: "KEY_F1",
  F2: "KEY_F2",
  F3: "KEY_F3",
  F4: "KEY_F4",
  F5: "KEY_F5",
  F6: "KEY_F6",
  F7: "KEY_F7",
  F8: "KEY_F8",
  F9: "KEY_F9",
  F10: "KEY_F10",
  F11: "KEY_F11",
  F12: "KEY_F12",
  Insert: "KEY_INSERT",
  Delete: "KEY_DELETE",
  Home: "KEY_HOME",
  End: "KEY_END",
  PageUp: "KEY_PAGEUP",
  PageDown: "KEY_PAGEDOWN",
  NumLock: "KEY_NUMLOCK",
  ScrollLock: "KEY_SCROLLLOCK",
  Pause: "KEY_PAUSE",
  ContextMenu: "KEY_MENU",
  "`": "KEY_GRAVE",
  "~": "KEY_GRAVE",
  "!": "KEY_1",
  "@": "KEY_2",
  "#": "KEY_3",
  $: "KEY_4",
  "%": "KEY_5",
  "^": "KEY_6",
  "&": "KEY_7",
  "*": "KEY_8",
  "(": "KEY_9",
  ")": "KEY_0",
  "-": "KEY_MINUS",
  _: "KEY_MINUS",
  "=": "KEY_EQUAL",
  "+": "KEY_EQUAL",
  "[": "KEY_LEFTBRACE",
  "{": "KEY_LEFTBRACE",
  "]": "KEY_RIGHTBRACE",
  "}": "KEY_RIGHTBRACE",
  "\\": "KEY_BACKSLASH",
  "|": "KEY_BACKSLASH",
  ";": "KEY_SEMICOLON",
  ":": "KEY_SEMICOLON",
  "'": "KEY_APOSTROPHE",
  '"': "KEY_APOSTROPHE",
  ",": "KEY_COMMA",
  "<": "KEY_COMMA",
  ".": "KEY_DOT",
  ">": "KEY_DOT",
  "/": "KEY_SLASH",
  "?": "KEY_SLASH",
};

/**
 * Maps a raw DOM key string to the evdev KEY_* code expected by the server.
 *
 * @param key - `event.key` value from a KeyboardEvent or synthetic equivalent.
 * @returns The evdev key string, or `null` when the key is unrecognised.
 */
function getKeyCode(key: string): string | null {
  if (KEY_MAP[key]) return KEY_MAP[key];
  if (/^[a-zA-Z]$/.test(key))
    return key === key.toLowerCase()
      ? `KEY_${key.toUpperCase()}`
      : `S-KEY_${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `KEY_${key}`;
  return null;
}

const CLICK_THRESHOLD_MS = 200;
const REPEAT_INTERVAL_MS = 100;
const NUDGE_THROTTLE_MS = 300;
const SCROLL_SPEED = 3;

export default function RemotePage() {
  const socket = useRef<WebSocket | null>(null);
  const hiddenInput = useRef<HTMLInputElement>(null);
  const [speed, setSpeed] = useState(20);

  const isTouching = useRef(false);
  const touchStartTime = useRef(0);
  const lastTouchX = useRef(0);
  const lastTouchY = useRef(0);
  const nudgeThrottle = useRef(false);
  const touch1 = useRef<{ x: number; y: number } | null>(null);
  const touch2 = useRef<{ x: number; y: number } | null>(null);
  const threeFingerDetected = useRef(false);

  const send = useCallback((command: string, args: unknown[] = []) => {
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify({ command, args }));
    }
  }, []);

  useEffect(() => {
    const serverIp = window.location.hostname;
    socket.current = new WebSocket(`ws://${serverIp}:8000/ws/input/`);

    return () => socket.current?.close();
  }, [send]); // Now 'send' is defined and safe to use

  /**
   * Creates press-and-hold handlers that fire immediately then repeat.
   *
   * @param key - The evdev key string to repeat.
   */
  const makeRepeatHandlers = (key: string) => {
    const interval = useRef<ReturnType<typeof setInterval> | null>(null);
    const start = () => {
      send("press_key", [key]);
      interval.current = setInterval(
        () => send("press_key", [key]),
        REPEAT_INTERVAL_MS,
      );
    };
    const stop = () => {
      if (interval.current) {
        clearInterval(interval.current);
        interval.current = null;
      }
    };
    return {
      onMouseDown: start,
      onTouchStart: (e: React.TouchEvent) => {
        e.preventDefault();
        start();
      },
      onMouseUp: stop,
      onMouseLeave: stop,
      onTouchEnd: stop,
    };
  };

  const upHandlers = makeRepeatHandlers("KEY_UP");
  const downHandlers = makeRepeatHandlers("KEY_DOWN");

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      threeFingerDetected.current = false;
      send("get_cursor_position", []);
      if (e.touches.length === 3) {
        threeFingerDetected.current = true;
        touch1.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        touch2.current = { x: e.touches[1].clientX, y: e.touches[1].clientY };
      } else if (e.touches.length === 2) {
        touch1.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        touch2.current = { x: e.touches[1].clientX, y: e.touches[1].clientY };
      } else {
        lastTouchX.current = e.touches[0].clientX;
        lastTouchY.current = e.touches[0].clientY;
        isTouching.current = true;
        touchStartTime.current = Date.now();
      }
    },
    [send],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      if (threeFingerDetected.current) return;
      if (e.touches.length === 2 && touch1.current && touch2.current) {
        const t1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        const t2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };
        const avg = (t1.y - touch1.current.y + (t2.y - touch2.current.y)) / 2;
        const key = avg < -1 ? "KEY_UP" : avg > 1 ? "KEY_DOWN" : null;
        if (key)
          for (let i = 0; i < SCROLL_SPEED; i++) send("press_key", [key]);
        touch1.current = t1;
        touch2.current = t2;
        return;
      }
      if (e.touches.length === 1 && isTouching.current) {
        const t = e.touches[0];
        const dx = (t.clientX - lastTouchX.current) * speed;
        const dy = (t.clientY - lastTouchY.current) * speed;
        lastTouchX.current = t.clientX;
        lastTouchY.current = t.clientY;
        if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1)
          send("move_relative", [dx, dy]);
        if (!nudgeThrottle.current) {
          send("get_cursor_position", []);
          nudgeThrottle.current = true;
          setTimeout(() => {
            nudgeThrottle.current = false;
          }, NUDGE_THROTTLE_MS);
        }
      }
    },
    [send, speed],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      if (threeFingerDetected.current && e.touches.length < 3) {
        send("click_button", ["BTN_RIGHT", "full"]);
        threeFingerDetected.current = false;
        touch1.current = touch2.current = null;
        return;
      }
      if (e.touches.length === 0) {
        if (
          isTouching.current &&
          Date.now() - touchStartTime.current < CLICK_THRESHOLD_MS
        )
          send("click_button", ["BTN_LEFT", "full"]);
        isTouching.current = false;
        touch1.current = touch2.current = null;
      }
    },
    [send],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      if (v.length > 0) {
        const c = getKeyCode(v[v.length - 1]);
        if (c) send("press_key", [c]);
      }
      e.target.value = "";
    },
    [send],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace") {
        e.preventDefault();
        send("press_key", ["KEY_BACKSPACE"]);
      }
    },
    [send],
  );

  return (
    <>
      <input
        ref={hiddenInput}
        type="text"
        style={{
          position: "absolute",
          opacity: 0,
          top: -100,
          left: -100,
          width: 1,
          height: 1,
        }}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
      />

      <div className={styles["remote-root"]}>
        {/* Icon row — matches screenshot exactly */}
        <div className={styles["icon-row"]}>
          <button
            className={styles["icon-btn"]}
            onClick={() => send("open_app", ["Next_View"])}
          >
            <img
              src="/static/icons/go-next-symbolic.svg "
              width={32}
              height={32}
              alt="Stremio"
              style={{ borderRadius: 6 }}
            />
          </button>
          <button
            className={styles["icon-btn"]}
            onClick={() => send("press_key", ["W-KEY_E"])}
          >
            <LayoutGrid size={32} color="#ebdbb2" />
          </button>
          <button
            className={styles["icon-btn"]}
            onClick={() => send("click_button", ["BTN_SIDE", "full"])}
          >
            <Copy size={32} color="#ebdbb2" />
          </button>
          <button
            className={styles["icon-btn"]}
            onClick={() => send("press_key", ["KEY_F11"])}
          >
            <Maximize size={32} color="#ebdbb2" />
          </button>
          <button
            className={styles["icon-btn"]}
            onClick={() => send("close_view")}
          >
            <X size={32} color="#ebdbb2" />
          </button>
        </div>

        {/* Mouse trackpad */}
        <div
          className={styles["mouse-area"]}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Static cursor SVG — centered, same as index.html */}
          <img
            src="/static/icons/app/cursor.svg"
            alt=""
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: 80,
              height: 80,
              pointerEvents: "none",
              opacity: 0.7,
            }}
          />
          <span className={styles["mouse-area-label"]}>trackpad</span>
        </div>

        {/* PGUp / Back / Forward / PGDn */}
        <div className={styles["nav-row"]}>
          <button
            className={styles["key-btn"]}
            onClick={() => send("press_key", ["KEY_PAGEUP"])}
          >
            PGUp
          </button>
          <button
            className={styles["key-btn"]}
            onClick={() => send("press_key", ["KEY_BACK"])}
          >
            Back
          </button>
          <button
            className={styles["key-btn"]}
            onClick={() => send("press_key", ["KEY_FORWARD"])}
          >
            Forward
          </button>
          <button
            className={styles["key-btn"]}
            onClick={() => send("press_key", ["KEY_PAGEDOWN"])}
          >
            PGDN
          </button>
        </div>

        {/* Arrow keys */}
        <div className={styles["arrow-row"]}>
          <button className={styles["key-btn"]} {...upHandlers}>
            ↑
          </button>
          <button
            className={styles["key-btn"]}
            onClick={() => send("press_key", ["KEY_LEFT"])}
          >
            ←
          </button>
          <button
            className={styles["key-btn"]}
            onClick={() => send("press_key", ["KEY_RIGHT"])}
          >
            →
          </button>
          <button className={styles["key-btn"]} {...downHandlers}>
            ↓
          </button>
        </div>

        {/* Speed slider */}
        <div className={styles["speed-row"]}>
          <span className={styles["speed-label"]}>Speed: {speed}x</span>
          <input
            type="range"
            min="1"
            max="50"
            step="1"
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
          />
        </div>

        {/* Volume + keyboard + menu */}
        <div className={styles["vol-row"]}>
          <button className={styles["key-btn"]} onClick={() => send("voldown")}>
            <Volume1 size={18} style={{ marginRight: 6 }} /> VOL −
          </button>
          <button className={styles["key-btn"]} onClick={() => send("volup")}>
            <Volume2 size={18} style={{ marginRight: 6 }} /> VOL +
          </button>
        </div>

        <div className={styles["bottom-row"]}>
          <button
            className={styles["key-btn"]}
            style={{ width: "100%" }}
            onClick={() => hiddenInput.current?.focus()}
          >
            <Keyboard size={28} />
          </button>
          <Link href="/menu" className={styles["menu-btn"]}>
            <MenuIcon size={28} />
          </Link>
        </div>
      </div>
    </>
  );
}
