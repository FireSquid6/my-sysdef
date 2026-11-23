/* Based on dwm's MIT-licensed config.def.h; see dwm's LICENSE. */
static const unsigned int borderpx = 2;
static const unsigned int snap = 32;
static const int showbar = 1;
static const int topbar = 1;
static const char *fonts[] = { "JetBrainsMono Nerd Font:size=10" };
static const char *colors[][3] = {
    [SchemeNorm] = { "#a9b1d6", "#1a1b26", "#32344a" },
    [SchemeSel]  = { "#c0caf5", "#24283b", "#7aa2f7" },
};
static const char *tags[] = { "1", "2", "3", "4", "5", "6", "7", "8", "9" };
static const Rule rules[] = {
    { NULL, NULL, NULL, 0, 0, -1 },
};
static const float mfact = 0.55;
static const int nmaster = 1;
static const int resizehints = 0;
static const int lockfullscreen = 1;
static const Layout layouts[] = {
    { "[]=", tile },
    { "><>", NULL },
    { "[M]", monocle },
};
#define MODKEY Mod4Mask

static void tagfollow(const Arg *arg) {
    tag(arg);
    view(arg);
}

#define TAGKEYS(KEY, TAG) \
    { MODKEY, KEY, view, {.ui = 1 << TAG} }, \
    { MODKEY|ShiftMask, KEY, tagfollow, {.ui = 1 << TAG} }, \
    { MODKEY|ControlMask, KEY, tag, {.ui = 1 << TAG} },

/* DWM's spawn() expects these even without a dmenu launcher. */
static char dmenumon[2] = "0";
static const char *dmenucmd[] = { NULL };
static const char *termcmd[] = { "alacritty", NULL };
static const Key keys[] = {
    { MODKEY, XK_t, spawn, {.v = termcmd} },
    { MODKEY|ShiftMask, XK_t, spawn, {.v = termcmd} },
    { MODKEY|ShiftMask, XK_q, killclient, {0} },
    /* DWM focuses a stack, not spatial directions. */
    { MODKEY, XK_h, focusstack, {.i = -1} },
    { MODKEY, XK_k, focusstack, {.i = -1} },
    { MODKEY, XK_j, focusstack, {.i = +1} },
    { MODKEY, XK_l, focusstack, {.i = +1} },
    { MODKEY, XK_Return, zoom, {0} },
    { MODKEY, XK_space, setlayout, {0} },
    { MODKEY|ShiftMask, XK_space, togglefloating, {0} },
    { MODKEY|ShiftMask, XK_f, togglefloating, {0} },
    { MODKEY|ControlMask, XK_h, setmfact, {.f = -0.05} },
    { MODKEY|ControlMask, XK_l, setmfact, {.f = +0.05} },
    { MODKEY, XK_Tab, view, {0} },
    TAGKEYS(XK_1, 0)
    TAGKEYS(XK_2, 1)
    TAGKEYS(XK_3, 2)
    TAGKEYS(XK_4, 3)
    TAGKEYS(XK_5, 4)
    TAGKEYS(XK_6, 5)
    TAGKEYS(XK_7, 6)
    TAGKEYS(XK_8, 7)
    TAGKEYS(XK_9, 8)
    { MODKEY|ControlMask|ShiftMask, XK_q, quit, {0} },
};
static const Button buttons[] = {
    { ClkLtSymbol, 0, Button1, setlayout, {0} },
    { ClkWinTitle, 0, Button2, zoom, {0} },
    { ClkStatusText, 0, Button2, spawn, {.v = termcmd} },
    { ClkClientWin, Mod1Mask|ShiftMask, Button1, movemouse, {0} },
    { ClkClientWin, Mod1Mask|ShiftMask, Button3, resizemouse, {0} },
    { ClkTagBar, 0, Button1, view, {0} },
    { ClkTagBar, MODKEY, Button1, tagfollow, {0} },
};
