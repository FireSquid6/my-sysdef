-- Hyprland 0.55+ configuration. The other Hypr tools still use their .conf files.

hl.monitor({ output = "", mode = "preferred", position = "auto", scale = "auto" })
hl.monitor({ output = "eDP-1", mode = "preferred", position = "auto", scale = 1 })
hl.monitor({ output = "DP-1", mode = "preferred", position = "auto-left", scale = 1 })
hl.monitor({ output = "HDMI-A-1", mode = "preferred", position = "auto-right", scale = 1 })

local terminal = "alacritty"
local fileManager = "dolphin"
local menu = "fuzzel"
local mainMod = "SUPER"
local alt = "ALT"

hl.env("XCURSOR_SIZE", "24")
hl.env("XCURSOR_THEME", "GoogleDot-Black")
hl.env("HYPRSHOT_DIR", "Pictures")
hl.env("QT_QPA_PLATFORMTHEME", "qt5ct")
hl.env("SCRIPTS_DIR", "/home/firesquid/sysdef/scripts")
hl.env("SYSTEM_CONFIG_DIR", "/home/firesquid/sysdef")

hl.config({
    input = {
        kb_layout = "us",
        kb_variant = "",
        kb_model = "",
        kb_options = "caps:escape",
        kb_rules = "",
        follow_mouse = 1,
        touchpad = { natural_scroll = false, disable_while_typing = false },
        sensitivity = 0,
    },
    general = {
        gaps_in = 5,
        gaps_out = 20,
        border_size = 2,
        col = {
            active_border = { colors = { "rgba(ff757fee)", "rgba(bb9af7ee)" }, angle = 45 },
            inactive_border = "rgba(1f2335ee)",
        },
        layout = "dwindle",
        allow_tearing = false,
    },
    group = {
        col = {
            border_active = { colors = { "rgba(bb9af7ee)", "rgba(ff757fee)" }, angle = 45 },
            border_inactive = "rgba(1f2335ee)",
        },
        groupbar = {
            col = { active = "rgba(282d42ee)", inactive = "rgba(1f2335ee)" },
        },
    },
    decoration = {
        rounding = 10,
        active_opacity = 1.0,
        inactive_opacity = 1.0,
        shadow = { enabled = true, range = 4, render_power = 3, color = "rgba(1a1a1aee)" },
        blur = { enabled = true, size = 3, passes = 1, vibrancy = 0.1696 },
    },
    animations = { enabled = true },
    dwindle = { preserve_split = true },
    misc = {
        disable_hyprland_logo = true,
        force_default_wallpaper = 0,
        disable_splash_rendering = true,
    },
})

hl.curve("easeOutQuint", { type = "bezier", points = { { 0.23, 1 }, { 0.32, 1 } } })
hl.curve("easeInOutCubic", { type = "bezier", points = { { 0.65, 0.05 }, { 0.36, 1 } } })
hl.curve("linear", { type = "bezier", points = { { 0, 0 }, { 1, 1 } } })
hl.curve("almostLinear", { type = "bezier", points = { { 0.5, 0.5 }, { 0.75, 1 } } })
hl.curve("quick", { type = "bezier", points = { { 0.15, 0 }, { 0.1, 1 } } })

hl.animation({ leaf = "global", enabled = true, speed = 10, bezier = "default" })
hl.animation({ leaf = "border", enabled = true, speed = 5.39, bezier = "easeOutQuint" })
hl.animation({ leaf = "windows", enabled = true, speed = 4.79, bezier = "easeOutQuint" })
hl.animation({ leaf = "windowsIn", enabled = true, speed = 4.1, bezier = "easeOutQuint", style = "popin 87%" })
hl.animation({ leaf = "windowsOut", enabled = true, speed = 1.49, bezier = "linear", style = "popin 87%" })
hl.animation({ leaf = "fadeIn", enabled = true, speed = 1.73, bezier = "almostLinear" })
hl.animation({ leaf = "fadeOut", enabled = true, speed = 1.46, bezier = "almostLinear" })
hl.animation({ leaf = "fade", enabled = true, speed = 3.03, bezier = "quick" })
hl.animation({ leaf = "layers", enabled = true, speed = 3.81, bezier = "easeOutQuint" })
hl.animation({ leaf = "layersIn", enabled = true, speed = 4, bezier = "easeOutQuint", style = "fade" })
hl.animation({ leaf = "layersOut", enabled = true, speed = 1.5, bezier = "linear", style = "fade" })
hl.animation({ leaf = "fadeLayersIn", enabled = true, speed = 1.79, bezier = "almostLinear" })
hl.animation({ leaf = "fadeLayersOut", enabled = true, speed = 1.39, bezier = "almostLinear" })
hl.animation({ leaf = "workspaces", enabled = true, speed = 1.94, bezier = "almostLinear", style = "fade" })
hl.animation({ leaf = "workspacesIn", enabled = true, speed = 1.21, bezier = "almostLinear", style = "fade" })
hl.animation({ leaf = "workspacesOut", enabled = true, speed = 1.94, bezier = "almostLinear", style = "fade" })

for _, workspace in ipairs({ 1, 2, 3, 4, 5, 6, 8 }) do
    hl.workspace_rule({ workspace = tostring(workspace), monitor = "DP-1" })
end
hl.workspace_rule({ workspace = "name:AI", persistent = true })

hl.window_rule({ name = "godot-debug", match = { title = "^(DEBUG)$" }, float = true })
hl.window_rule({ name = "floating-explorer", match = { class = "^(explorer)$" }, float = true, size = { 1200, 800 } })
hl.window_rule({ name = "thunar-float", match = { class = "^(thunar)$" }, float = true, center = true, size = { 800, 600 } })
hl.window_rule({ name = "youtube-music", match = { title = "^.*(YouTube Music).*$" }, float = true, size = { 1200, 1000 }, workspace = "special:music" })
hl.window_rule({ name = "spotify-capital", match = { class = "Spotify" }, float = true, size = { 1200, 1000 }, workspace = "special:music" })
hl.window_rule({ name = "spotify-lowercase", match = { class = "spotify" }, float = true, size = { 1200, 1000 }, workspace = "special:music" })
-- Group the AI apps without depending on their window classes.
hl.window_rule({ name = "ai-group", match = { workspace = "name:AI" }, group = "set" })

hl.on("hyprland.start", function()
    hl.exec_cmd("/home/firesquid/sysdef/scripts/hypr-startup.sh")
    hl.exec_cmd(terminal .. " --command tmux attach -t home", {
        workspace = "special:a", float = true, size = { 1200, 1000 }, center = true,
    })
    hl.exec_cmd("obsidian", { workspace = "8" })
    hl.exec_cmd("protonmail-bridge", { workspace = "8" })
    hl.exec_cmd("/home/firesquid/.local/bin/openchamber-desktop", { workspace = "name:AI" })
    hl.exec_cmd("/home/firesquid/.local/bin/hermes desktop", { workspace = "name:AI" })
end)

hl.bind(mainMod .. " + SHIFT + Q", hl.dsp.window.close())
hl.bind(mainMod .. " + SHIFT + T", hl.dsp.exec_cmd(terminal))
hl.bind(mainMod .. " + E", hl.dsp.exec_cmd(fileManager))
hl.bind(mainMod .. " + X", hl.dsp.exec_cmd(menu))
hl.bind(mainMod .. " + P", hl.dsp.exec_cmd("/home/firesquid/sysdef/scripts/open-menu.sh powermenu"))
hl.bind(mainMod .. " + O", hl.dsp.exec_cmd("/home/firesquid/sysdef/scripts/open-menu.sh open-project"))

hl.bind(mainMod .. " + " .. alt .. " + F", hl.dsp.exec_cmd("firefox"))
hl.bind(mainMod .. " + " .. alt .. " + E", hl.dsp.exec_cmd("alacritty --class explorer --command yazi"))
hl.bind(mainMod .. " + " .. alt .. " + T", hl.dsp.exec_cmd("thunderbird"))
hl.bind(mainMod .. " + " .. alt .. " + D", hl.dsp.exec_cmd("discord"))

for key, direction in pairs({ H = "l", L = "r", K = "u", J = "d" }) do
    hl.bind(mainMod .. " + " .. key, hl.dsp.focus({ direction = direction }))
    hl.bind(mainMod .. " + SHIFT + " .. key, hl.dsp.window.move({ direction = direction }))
end

for i = 1, 6 do
    local key = tostring(i)
    hl.bind(mainMod .. " + " .. key, hl.dsp.focus({ workspace = i }))
    hl.bind(mainMod .. " + SHIFT + " .. key, hl.dsp.window.move({ workspace = i }))
    hl.bind(mainMod .. " + CONTROL + " .. key, hl.dsp.window.move({ workspace = i, follow = false }))
end
hl.bind(mainMod .. " + G", hl.dsp.focus({ workspace = 7 }))
hl.bind(mainMod .. " + Q", hl.dsp.focus({ workspace = 8 }))
hl.bind(mainMod .. " + S", hl.dsp.focus({ workspace = "name:AI" }))
hl.bind(mainMod .. " + SHIFT + G", hl.dsp.window.move({ workspace = 7 }))
hl.bind(mainMod .. " + CONTROL + G", hl.dsp.window.move({ workspace = 7, follow = false }))
hl.bind(mainMod .. " + CONTROL + Q", hl.dsp.window.move({ workspace = 7, follow = false }))

hl.bind(alt .. " + SHIFT + mouse:272", hl.dsp.window.drag(), { mouse = true })
hl.bind(alt .. " + SHIFT + mouse:273", hl.dsp.window.resize(), { mouse = true })
hl.bind(alt .. " + TAB", hl.dsp.exec_cmd("rofi -modi window -show window"))

hl.bind("XF86AudioRaiseVolume", hl.dsp.exec_cmd("pamixer -i 5"), { repeating = true })
hl.bind("XF86AudioLowerVolume", hl.dsp.exec_cmd("pamixer -d 5"), { repeating = true })
hl.bind("XF86AudioMute", hl.dsp.exec_cmd("pamixer -t"))
hl.bind("XF86AudioPlay", hl.dsp.exec_cmd("playerctl play-pause"))
hl.bind("XF86AudioPause", hl.dsp.exec_cmd("playerctl play-pause"))
hl.bind("XF86AudioNext", hl.dsp.exec_cmd("playerctl next"))
hl.bind("XF86AudioPrev", hl.dsp.exec_cmd("playerctl previous"))

hl.bind(mainMod .. " + Y", hl.dsp.workspace.toggle_special("music"))
hl.bind(mainMod .. " + SHIFT + A", function()
    hl.dispatch(hl.dsp.window.float())
    hl.dispatch(hl.dsp.window.resize({ x = 1200, y = 1000 }))
    hl.dispatch(hl.dsp.window.center())
    hl.dispatch(hl.dsp.window.move({ workspace = "special:a" }))
end)
hl.bind(mainMod .. " + CONTROL + A", hl.dsp.window.move({ workspace = "special:a", follow = false }))
hl.bind(mainMod .. " + A", hl.dsp.workspace.toggle_special("a"))

hl.bind(mainMod .. " + " .. alt .. " + S", hl.dsp.exec_cmd("hyprshot -c -m region"))
hl.bind("XF86MonBrightnessUp", hl.dsp.exec_cmd("brightnessctl s +10%"))
hl.bind("XF86MonBrightnessDown", hl.dsp.exec_cmd("brightnessctl s 10%-"))
hl.bind(mainMod .. " + SHIFT + " .. alt .. " + S", hl.dsp.exec_cmd("hyprctl dispatch dpms toggle"))

for key, direction in pairs({ left = "l", right = "r", up = "u", down = "d" }) do
    hl.bind(mainMod .. " + CONTROL + " .. key, hl.dsp.workspace.move({ monitor = direction }))
end

hl.bind(mainMod .. " + SPACE", hl.dsp.group.next())
hl.bind(mainMod .. " + SHIFT + SPACE", hl.dsp.group.toggle())
for key, direction in pairs({ H = "l", J = "d", K = "u", L = "r" }) do
    hl.bind(mainMod .. " + " .. alt .. " + " .. key, hl.dsp.window.move({ into_group = direction }))
    hl.bind(mainMod .. " + " .. alt .. " + SHIFT + " .. key, hl.dsp.window.move({ out_of_group = direction }))
end

hl.bind(mainMod .. " + SHIFT + F", function()
    hl.dispatch(hl.dsp.window.float())
    hl.dispatch(hl.dsp.window.resize({ x = 1200, y = 1000 }))
    hl.dispatch(hl.dsp.window.center())
end)
hl.bind(mainMod .. " + C", hl.dsp.window.center())
