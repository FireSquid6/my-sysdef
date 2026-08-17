local opencode = require("opencode")

local wk = require("which-key")
local opencode_cmd = "opencode --port"
local terminal_opts = {
  win = {
    position = "right",
    enter = false,
  },
}

---@type opencode.Opts
vim.g.opencode_opts = {
  server = {
    start = function()
      Snacks.terminal.open(opencode_cmd, terminal_opts)
    end,
  },
}

local function close_opencode()
  local terminal = Snacks.terminal.get(opencode_cmd, { create = false })
  if terminal then
    terminal:close()
  end
end

wk.add({
  { "<leader>a", group = "AI" },
  {
    "<c-.>",
    function() Snacks.terminal.focus(opencode_cmd, terminal_opts) end,
    mode = { "n", "t", "i", "x" },
    desc = "OpenCode Focus",
  },
  {
    "<leader>aa",
    function() Snacks.terminal.toggle(opencode_cmd, terminal_opts) end,
    desc = "OpenCode Toggle",
  },
  {
    "<leader>as",
    function() require("opencode").select() end,
    desc = "Select OpenCode",
  },
  {
    "<leader>ad",
    close_opencode,
    desc = "Detach OpenCode Session",
  },
  {
    "<leader>at",
    function() require("opencode").prompt("@this ") end,
    mode = { "x", "n" },
    desc = "Send This",
  },
  {
    "<leader>af",
    function() require("opencode").prompt("@buffer ") end,
    desc = "Send File",
  },
  {
    "<leader>av",
    function() require("opencode").prompt("@this ") end,
    mode = { "x" },
    desc = "Send Visual Selection",
  },
  {
    "<leader>ap",
    function() require("opencode").select() end,
    mode = { "n", "x" },
    desc = "OpenCode Select Prompt",
  },
})
