-- Only loaded when AI tooling is enabled (see init.lua / has_noclaude).
-- Force-load the sidekick plugin, which is installed but lazy in plugins.lua.
require("lazy").load({ plugins = { "sidekick.nvim" } })

require("sidekick").setup({
  -- add any options here
  cli = {
    mux = {
      backend = "zellij",
      enabled = true,
    },
  },
})

local wk = require("which-key")

wk.add({
  { "<leader>a", group = "AI" },
  {
    "<c-.>",
    function() require("sidekick.cli").focus() end,
    mode = { "n", "t", "i", "x" },
    desc = "Sidekick Focus",
  },
  {
    "<leader>aa",
    function() require("sidekick.cli").toggle() end,
    desc = "Sidekick Toggle CLI",
  },
  {
    "<leader>as",
    function() require("sidekick.cli").select() end,
    -- Or to select only installed tools:
    -- require("sidekick.cli").select({ filter = { installed = true } })
    desc = "Select CLI",
  },
  {
    "<leader>ad",
    function() require("sidekick.cli").close() end,
    desc = "Detach a CLI Session",
  },
  {
    "<leader>at",
    function() require("sidekick.cli").send({ msg = "{this}" }) end,
    mode = { "x", "n" },
    desc = "Send This",
  },
  {
    "<leader>af",
    function() require("sidekick.cli").send({ msg = "{file}" }) end,
    desc = "Send File",
  },
  {
    "<leader>av",
    function() require("sidekick.cli").send({ msg = "{selection}" }) end,
    mode = { "x" },
    desc = "Send Visual Selection",
  },
  {
    "<leader>ap",
    function() require("sidekick.cli").prompt() end,
    mode = { "n", "x" },
    desc = "Sidekick Select Prompt",
  },
  -- Open Claude directly
  {
    "<leader>ac",
    function() require("sidekick.cli").toggle({ name = "claude", focus = true }) end,
    desc = "Sidekick Toggle Claude",
  },
})
