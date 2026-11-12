-- Main config for Hyprland 0.57+ (Lua). Migrated from hyprland.conf.
-- ~/.config/hypr is linked to this directory by modules/desktop.ts.
local terminal = "alacritty"
local fileManager = "dolphin"
local ags = 'bash "${XDG_CONFIG_HOME:-$HOME/.config}/ags/control.sh" '
local menu = ags .. "launcher"
local scripts = "/home/firesquid/sysdef/scripts"

hl.monitor({ output = "", mode = "preferred", position = "auto", scale = "auto" })
hl.monitor({ output = "eDP-1", mode = "preferred", position = "auto", scale = 1 })
hl.monitor({ output = "DP-1", mode = "preferred", position = "auto-left", scale = 1 })
hl.monitor({ output = "HDMI-A-1", mode = "preferred", position = "auto-right", scale = 1 })

hl.env("XCURSOR_SIZE", "24")
hl.env("XCURSOR_THEME", "GoogleDot-Black")
hl.env("HYPRSHOT_DIR", "Pictures")
hl.env("QT_QPA_PLATFORMTHEME", "qt5ct")
hl.env("SCRIPTS_DIR", scripts)
hl.env("SYSTEM_CONFIG_DIR", "/home/firesquid/sysdef")

-- Run only at session start, not on config reload.
hl.on("hyprland.start", function()
    hl.exec_cmd(scripts .. "/hypr-startup.sh")
    hl.exec_cmd(terminal .. " --command tmux attach -t home", {
        workspace = "special:a", float = true, size = "1200 1000", center = true,
    })
    hl.exec_cmd("bash " .. scripts .. "/workspace-session.sh")
end)

hl.config({
    input = {
        kb_layout = "us",
        kb_options = "caps:escape",
        follow_mouse = 1,
        sensitivity = 0,
        touchpad = { natural_scroll = false, disable_while_typing = false },
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
        groupbar = { col = { active = "rgba(282d42ee)", inactive = "rgba(1f2335ee)" } },
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

for _, animation in ipairs({
    { "global", 10, "default" },
    { "border", 5.39, "easeOutQuint" },
    { "windows", 4.79, "easeOutQuint" },
    { "windowsIn", 4.1, "easeOutQuint", "popin 87%" },
    { "windowsOut", 1.49, "linear", "popin 87%" },
    { "fadeIn", 1.73, "almostLinear" },
    { "fadeOut", 1.46, "almostLinear" },
    { "fade", 3.03, "quick" },
    { "layers", 3.81, "easeOutQuint" },
    { "layersIn", 4, "easeOutQuint", "fade" },
    { "layersOut", 1.5, "linear", "fade" },
    { "workspaces", 1.94, "easeOutQuint", "fade" },
    { "workspacesIn", 1.21, "easeOutQuint", "fade" },
    { "workspacesOut", 1.94, "easeOutQuint", "fade" },
}) do
    hl.animation({ leaf = animation[1], enabled = true, speed = animation[2], bezier = animation[3], style = animation[4] })
end

-- Placement and per-session numeric floating modes are owned by workspace-manager.ts.
-- Named workspaces stay tiled; native popup/explicit floating rules remain exceptions.
for _, workspace in ipairs({ "name:S", "name:G", "name:R", "name:N", "1", "2", "3", "4", "5", "6", "7", "8", "9" }) do
    hl.workspace_rule({ workspace = workspace, persistent = true, layout = "dwindle" })
end

hl.window_rule({ name = "godot-debug", match = { title = "^(DEBUG)$" }, float = true })
hl.window_rule({ name = "floating-exporer", match = { class = "^(explorer)$" }, float = true, size = "1200 800" })
hl.window_rule({ name = "thunar-float", match = { class = "^(thunar)$" }, float = true, center = true, size = "800 600" })
hl.window_rule({ name = "youtube-music", match = { title = "^.*(YouTube Music).*$" }, float = true, size = "1200 1000", workspace = "special:music" })
hl.window_rule({ name = "spotify-capital", match = { class = "Spotify" }, float = true, size = "1200 1000", workspace = "special:music" })
hl.window_rule({ name = "spotify-lowercase", match = { class = "spotify" }, float = true, size = "1200 1000", workspace = "special:music" })

-- Tokyo Night machine colors. Title matching is dynamic, so SSH and tmux
-- pane switches update both normal and special-workspace terminal borders.
-- Restrict to terminals so a browser title containing a hostname is unaffected.
for host, color in pairs({
    deisslaptop = "bb9af7",
    ["minibox-one"] = "9ece6a",
    desktop = "f7768e",
}) do
    hl.window_rule({
        name = "terminal-host-" .. host,
        match = { class = "^(Alacritty|alacritty)$", title = "^" .. host .. ":.*$" },
        border_color = "rgb(" .. color .. ") rgb(" .. color .. ")",
    })
end

-- Application shortcuts.
hl.bind("SUPER + SHIFT + Q", hl.dsp.window.close())
hl.bind("SUPER + SHIFT + T", hl.dsp.exec_cmd(terminal))
hl.bind("SUPER + E", hl.dsp.exec_cmd(fileManager))
hl.bind("SUPER + X", hl.dsp.exec_cmd(menu))
hl.bind("SUPER + P", hl.dsp.exec_cmd(ags .. "sidebar"))
hl.bind("SUPER + B", hl.dsp.exec_cmd(ags .. "notifications"))
hl.bind("SUPER + O", hl.dsp.exec_cmd(ags .. "projects"))
hl.bind("SUPER + M", hl.dsp.exec_cmd(ags .. "monitors"))
hl.bind("SUPER + T", hl.dsp.exec_cmd("bun " .. scripts .. "/workspace-manager.ts toggle"))
hl.bind("SUPER + ALT + F", hl.dsp.exec_cmd("firefox"))
hl.bind("SUPER + ALT + E", hl.dsp.exec_cmd("alacritty --class explorer --command yazi"))
hl.bind("SUPER + ALT + T", hl.dsp.exec_cmd("thunderbird"))
hl.bind("SUPER + ALT + D", hl.dsp.exec_cmd("discord"))

for key, direction in pairs({ H = "left", L = "right", K = "up", J = "down" }) do
    hl.bind("SUPER + " .. key, hl.dsp.focus({ direction = direction }))
    hl.bind("SUPER + SHIFT + " .. key, hl.dsp.window.move({ direction = direction }))
    hl.bind("SUPER + ALT + " .. key, hl.dsp.window.move({ into_group = direction }))
    hl.bind("SUPER + ALT + SHIFT + " .. key, hl.dsp.window.move({ out_of_group = direction }))
end

for _, key in ipairs({ "S", "G", "R", "N", "1", "2", "3", "4", "5", "6", "7", "8", "9" }) do
    local workspace = tonumber(key) or ("name:" .. key)
    hl.bind("SUPER + " .. key, hl.dsp.focus({ workspace = workspace }))
    hl.bind("SUPER + SHIFT + " .. key, hl.dsp.window.move({ workspace = workspace, follow = true }))
    hl.bind("SUPER + CTRL + " .. key, hl.dsp.window.move({ workspace = workspace, follow = false }))
end

hl.bind("ALT + SHIFT + mouse:272", hl.dsp.window.drag(), { mouse = true })
hl.bind("ALT + SHIFT + mouse:273", hl.dsp.window.resize(), { mouse = true })
hl.bind("ALT + Tab", hl.dsp.exec_cmd(ags .. "windows"))

hl.bind("XF86AudioRaiseVolume", hl.dsp.exec_cmd("pamixer -i 5"), { repeating = true })
hl.bind("XF86AudioLowerVolume", hl.dsp.exec_cmd("pamixer -d 5"), { repeating = true })
hl.bind("XF86AudioMute", hl.dsp.exec_cmd("pamixer -t"))
hl.bind("XF86AudioPlay", hl.dsp.exec_cmd("playerctl play-pause"))
hl.bind("XF86AudioPause", hl.dsp.exec_cmd("playerctl play-pause"))
hl.bind("XF86AudioNext", hl.dsp.exec_cmd("playerctl next"))
hl.bind("XF86AudioPrev", hl.dsp.exec_cmd("playerctl previous"))
hl.bind("XF86MonBrightnessUp", hl.dsp.exec_cmd("brightnessctl s +10%"))
hl.bind("XF86MonBrightnessDown", hl.dsp.exec_cmd("brightnessctl s 10%-"))
hl.bind("SUPER + ALT + S", hl.dsp.exec_cmd("hyprshot -c -m region"))
hl.bind("SUPER + ALT + SHIFT + S", function()
    hl.timer(function() hl.dispatch(hl.dsp.dpms({ action = "toggle" })) end, { timeout = 500, type = "oneshot" })
end)

hl.bind("SUPER + Y", hl.dsp.workspace.toggle_special("music"))
hl.bind("SUPER + A", hl.dsp.workspace.toggle_special("a"))
hl.bind("SUPER + CTRL + A", hl.dsp.window.move({ workspace = "special:a", follow = false }))

local function floatAndCenter()
    hl.dispatch(hl.dsp.window.float({ action = "toggle" }))
    hl.dispatch(hl.dsp.window.resize({ x = 1200, y = 1000, relative = false }))
    hl.dispatch(hl.dsp.window.center())
end
hl.bind("SUPER + SHIFT + F", hl.dsp.exec_cmd("bun " .. scripts .. "/workspace-manager.ts manual-float"))
hl.bind("SUPER + SHIFT + A", function()
    floatAndCenter()
    hl.dispatch(hl.dsp.window.move({ workspace = "special:a", follow = true }))
end)

for _, direction in ipairs({ "left", "right", "up", "down" }) do
    hl.bind("SUPER + CTRL + " .. direction, hl.dsp.workspace.move({ monitor = direction }))
end

hl.bind("SUPER + SPACE", hl.dsp.group.next())
hl.bind("SUPER + SHIFT + SPACE", hl.dsp.group.toggle())
hl.bind("SUPER + C", hl.dsp.window.center())

-- Idempotent on reload: one controller per Hyprland session. Its private log stays local.
-- Config verification evaluates Lua too; never launch desktop services from it.
if not (os.getenv("HYPRLAND_CMD") or ""):find("--verify-config", 1, true) then
    -- The AGS startup lock serializes controller startup too: don't launch it
    -- separately here, which can race the controller's initial socket bind.
    hl.exec_cmd('bash "${XDG_CONFIG_HOME:-$HOME/.config}/ags/start.sh" >> "$XDG_RUNTIME_DIR/sysdef-ags-start.log" 2>&1')
end
