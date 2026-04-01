import json
import traceback
import base64
import os
import subprocess
import time
import shutil
import tomllib
import tldextract
import threading
from channels.generic.websocket import AsyncWebsocketConsumer
from wayfire import WayfireSocket
from wayfire.extra.stipc import Stipc
from wayfire.extra.ipc_utils import WayfireUtils as Utils

UPLOAD_DIR = os.path.expanduser("~/Downloads")
SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), "scripts")

DEFAULT_CURSOR_SIZE = 32
TEMPORARY_CURSOR_SIZE = 64
RESET_DELAY_SECONDS = 1.0
reset_timer = None


def set_cursor_size(size):
    subprocess.run(
        ["gsettings", "set", "org.gnome.desktop.interface", "cursor-size", str(size)]
    )


def schedule_cursor_reset():
    global reset_timer
    if reset_timer:
        reset_timer.cancel()
    reset_timer = threading.Timer(
        RESET_DELAY_SECONDS, set_cursor_size, args=[DEFAULT_CURSOR_SIZE]
    )
    reset_timer.start()


def launch_steam_game_hidden(app_id):
    try:
        subprocess.Popen(["steam", "-silent", "-applaunch", app_id, "-novid"])
        return True
    except Exception as e:
        print(f"Error launching game: {e}")
        return False


def get_domain_name(url):
    extracted = tldextract.extract(url)
    return f"{extracted.domain}"


def focus_if_already_open(sock, streaming):
    streaming = get_domain_name(streaming)
    if streaming == "paramountplus":
        streaming = "paramount"
    for view in sock.list_views():
        title = view["title"].lower()
        if len(title.split()) > 1:
            pass
        else:
            continue
        app_id = view["app-id"]
        if "microsoft-edge" in app_id.lower():
            if streaming in title:
                sock.set_focus(view["id"])
                sock.set_view_fullscreen(view["id"], True)
                return True
    return False


class VolumeControl:
    def __init__(self):
        self.volume_step = 25
        self.max_volume = 200
        self.min_volume = 0

    def _get_current_volume(self):
        result = subprocess.run(
            ["pactl", "get-sink-volume", "@DEFAULT_SINK@"],
            capture_output=True,
            text=True,
        )
        volume_line = result.stdout.splitlines()[0]
        return int(volume_line.split("/")[1].strip().replace("%", ""))

    def _set_volume(self, volume):
        subprocess.run(["pactl", "set-sink-volume", "@DEFAULT_SINK@", f"{volume}%"])

    def volup(self):
        current_volume = self._get_current_volume()
        new_volume = min(self.max_volume, current_volume + self.volume_step)
        self._set_volume(new_volume)

    def voldown(self):
        current_volume = self._get_current_volume()
        new_volume = max(self.min_volume, current_volume - self.volume_step)
        self._set_volume(new_volume)


class InputConsumer(AsyncWebsocketConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        try:
            self.sock = WayfireSocket()
            self.stipc = Stipc(self.sock)
            self.utils = Utils(self.sock)
            print("[DEBUG] Wayfire Stack Initialized")
        except Exception as e:
            print(f"[ERROR] Connection to Wayfire failed: {e}")

    async def connect(self):
        await self.accept()
        print(f"[CONNECT] Phone linked: {self.scope['client']}")

    async def disconnect(self, close_code):
        print(f"[DISCONNECT] Remote closed: {close_code}")

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            return

        try:
            data = json.loads(text_data)
            command = data.get("command")
            args = data.get("args", [])

            print(f"[RECV] {command} | {args}")

            if command == "move_relative":
                if len(args) == 2:
                    dx, dy = map(int, args)

                    # sock.get_cursor_position() returns tuple(int, int)
                    curr_pos = self.sock.get_cursor_position()

                    if curr_pos and len(curr_pos) == 2:
                        # Handle tuple unpacking
                        curr_x, curr_y = curr_pos
                        new_x = int(curr_x) + dx
                        new_y = int(curr_y) + dy

                        self.stipc.move_cursor(new_x, new_y)
                    else:
                        # Fallback to direct stipc relative move
                        self.stipc.move_cursor(dx, dy)

                    set_cursor_size(TEMPORARY_CURSOR_SIZE)
                    schedule_cursor_reset()

            elif command == "get_cursor_position":
                set_cursor_size(TEMPORARY_CURSOR_SIZE)
                schedule_cursor_reset()
                try:
                    cursor_position = self.sock.get_cursor_position()
                    await self.send(text_data=json.dumps(cursor_position))
                except Exception as e:
                    await self.send(
                        text_data=json.dumps(
                            {"error": f"Failed to get cursor position: {str(e)}"}
                        )
                    )

            elif command == "move_cursor":
                if len(args) == 2:
                    x, y = args
                    self.stipc.move_cursor(x, y)
                    await self.send(text_data=json.dumps({"status": "Mouse moved"}))

            elif command == "click_button":
                if len(args) == 2:
                    button, action = args
                    self.stipc.click_button(button, action)

            elif command == "press_key":
                if args:
                    self.stipc.press_key(args[0])

            elif command == "set_fullscreen":
                focused_view = self.sock.get_focused_view()
                if focused_view and "id" in focused_view:
                    self.sock.set_view_fullscreen(focused_view["id"], True)

            elif command == "execute_script":
                script = args[0] if args else None
                if script:
                    script_path = os.path.join(SCRIPTS_DIR, script)
                    if os.path.exists(script_path):
                        if script.endswith(".py"):
                            subprocess.Popen(["python", script_path])
                        else:
                            subprocess.Popen(["bash", script_path])
                        await self.send(
                            text_data=json.dumps(
                                {"message": f"Executed script: {script}"}
                            )
                        )
                    else:
                        await self.send(
                            text_data=json.dumps({"error": "Script not found"})
                        )

            elif command == "open_steam_game":
                view = self.sock.get_focused_view()
                if view and "id" in view:
                    self.sock.close_view(view["id"])
                app_id = args[0] if args else None
                if app_id:
                    launch_steam_game_hidden(app_id)
                    await self.send(
                        text_data=json.dumps(
                            {
                                "status": "success",
                                "message": f"Launching Steam game {app_id}",
                            }
                        )
                    )

            elif command == "shutdown":
                self.stipc.run_cmd("shutdown -h now")

            elif command == "upload_file":
                if (
                    isinstance(args, dict)
                    and "filename" in args
                    and "file_data" in args
                ):
                    filename = args["filename"]
                    file_data = args["file_data"]
                    try:
                        file_bytes = base64.b64decode(file_data)
                        file_path = os.path.join(UPLOAD_DIR, filename)
                        with open(file_path, "wb") as file:
                            file.write(file_bytes)
                        await self.send(
                            text_data=json.dumps(
                                {"message": f"File uploaded successfully: {filename}"}
                            )
                        )
                    except Exception as e:
                        await self.send(
                            text_data=json.dumps(
                                {"error": f"Failed to upload file: {str(e)}"}
                            )
                        )

            elif command == "close_view":
                view_id = self.utils.get_focused_view_id()
                if view_id is not None:
                    self.sock.close_view(view_id)
                    print(f"[WINDOW] Closed {view_id}")
                else:
                    print("[WARN] No focused view found")

            elif command == "open_url":
                if len(args) == 1:
                    url = args[0]
                    already_open = focus_if_already_open(self.sock, url)
                    if not already_open:
                        try:
                            edge = f"XDG_SESSION_TYPE=wayland MOZ_ENABLE_WAYLAND=1 GDK_BACKEND=wayland microsoft-edge-stable --enable-features=UseOzonePlatform --ozone-platform=wayland --gtk-version=4 --app={url}"
                            if shutil.which("mullvad-exclude"):
                                edge = f"XDG_SESSION_TYPE=wayland MOZ_ENABLE_WAYLAND=1 GDK_BACKEND=wayland mullvad-exclude microsoft-edge-stable --enable-features=UseOzonePlatform --ozone-platform=wayland --gtk-version=4 --app={url}"
                            self.stipc.run_cmd("killall -9 msedge")
                            self.stipc.run_cmd(edge)
                            time.sleep(2)
                            view = self.sock.get_focused_view()
                            if view and "id" in view:
                                self.sock.set_view_fullscreen(view["id"], True)
                            await self.send(
                                text_data=json.dumps({"status": f"Opened URL: {url}"})
                            )
                        except Exception as e:
                            await self.send(
                                text_data=json.dumps(
                                    {"error": f"Failed to open URL: {str(e)}"}
                                )
                            )

            elif command == "open_custom_url":
                if len(args) == 1:
                    url = args[0]
                    try:
                        edge = f"XDG_SESSION_TYPE=wayland MOZ_ENABLE_WAYLAND=1 GDK_BACKEND=wayland microsoft-edge-stable --enable-features=UseOzonePlatform --ozone-platform=wayland --gtk-version=4 --app={url}"
                        if shutil.which("mullvad-exclude"):
                            edge = f"XDG_SESSION_TYPE=wayland MOZ_ENABLE_WAYLAND=1 GDK_BACKEND=wayland mullvad-exclude microsoft-edge-stable --enable-features=UseOzonePlatform --ozone-platform=wayland --gtk-version=4 --app={url}"
                        self.stipc.run_cmd("killall -9 msedge")
                        self.stipc.run_cmd(edge)
                        time.sleep(2)
                        view = self.sock.get_focused_view()
                        if view and "id" in view:
                            self.sock.set_view_fullscreen(view["id"], True)
                        await self.send(
                            text_data=json.dumps({"status": f"Opened URL: {url}"})
                        )
                    except Exception as e:
                        await self.send(
                            text_data=json.dumps(
                                {"error": f"Failed to open URL: {str(e)}"}
                            )
                        )

            elif command == "get_config_value":
                try:
                    config_path = os.path.expanduser("~/.config/wayremote.ini")
                    with open(config_path, "rb") as f:
                        config = tomllib.load(f)
                    response = {
                        "touchpad_speed": config.get("touchpad_speed"),
                        "scroll_speed": config.get("scroll_speed"),
                    }
                    await self.send(text_data=json.dumps(response))
                except Exception as e:
                    await self.send(text_data=json.dumps({"error": str(e)}))

            elif command == "volup":
                vol = VolumeControl()
                vol.volup()

            elif command == "voldown":
                vol = VolumeControl()
                vol.voldown()

            else:
                if hasattr(self.sock, command):
                    method = getattr(self.sock, command)
                    if callable(method):
                        if not isinstance(args, (list, tuple)):
                            args = [args]
                        try:
                            result = method(*args)
                            await self.send(text_data=json.dumps(result, default=str))
                        except Exception as e:
                            await self.send(text_data=json.dumps({"error": str(e)}))

        except Exception as e:
            print(f"[EXECUTION ERROR] {e}")
            traceback.print_exc()
