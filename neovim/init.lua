local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not (vim.uv or vim.loop).fs_stat(lazypath) then
  vim.fn.system({
    "git",
    "clone",
    "--filter=blob:none",
    "https://github.com/folke/lazy.nvim.git",
    "--branch=stable", -- latest stable release
    lazypath,
  })
end
vim.opt.rtp:prepend(lazypath)

vim.g.mapleader = " "
vim.g.maplocalleader = ","
vim.opt.smartindent = false
vim.opt.autoindent = false


require("options")
require("plugins")

vim.cmd 'colorscheme tokyonight-night'

require("mappings")
require("lsp")
require("dap-config")



vim.api.nvim_create_autocmd("FileType", {
  pattern = "markdown",
  callback = function()
    vim.opt_local.spell = true
  end,
})

vim.api.nvim_create_user_command("DailyNote", function()
  local path = os.date(vim.fn.expand("~/notes/journal/%Y-%m-%d.md"))
  vim.fn.mkdir(vim.fn.expand("~/notes/journal"), "p")
  vim.cmd("edit " .. path)
end, {})

vim.api.nvim_create_user_command("Daybook", function()
  local path = vim.fn.expand("~/notes/daybook/_.md")
  if vim.fn.filereadable(path) == 0 then
    local template = vim.fn.expand("~/notes/daybook/template.md")
    vim.fn.mkdir(vim.fn.expand("~/notes/daybook"), "p")
    if vim.fn.filereadable(template) == 1 then
      vim.fn.system({ "cp", template, path })
    end
  end
  vim.cmd("edit " .. path)
end, {})

-- Skip AI setup if a .noclaude file exists between cwd and the first dir containing a git repo
local function has_noclaude()
  local cwd = vim.fn.getcwd()
  local dir = cwd
  while true do
    if vim.fn.filereadable(dir .. "/.noclaude") == 1 then
      return true
    end
    -- Stop once we reach a directory containing a git repo
    if vim.fn.isdirectory(dir .. "/.git") == 1 or vim.fn.filereadable(dir .. "/.git") == 1 then
      return false
    end
    local parent = vim.fs.dirname(dir)
    if parent == dir then
      return false
    end
    dir = parent
  end
end

if not has_noclaude() then
  require("ai-setup")
end
