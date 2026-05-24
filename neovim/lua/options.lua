-- workaround for nvim 0.12.x nil range() bug in markdown treesitter injection
-- vim.api.nvim_create_autocmd("FileType", {
--   pattern = "markdown",
--   callback = function(args)
--     vim.schedule(function()
--       vim.treesitter.stop(args.buf)
--     end)
--   end,
-- })

vim.opt.number = true
vim.opt.relativenumber = true
vim.opt.conceallevel = 0

vim.opt.tabstop = 2
vim.opt.shiftwidth = 2
vim.opt.expandtab = true

vim.opt.termguicolors = true

vim.opt.ignorecase = true

vim.opt.cmdheight = 0
vim.opt.linebreak = true

vim.opt.laststatus = 3
vim.opt.numberwidth = 4
vim.opt.signcolumn = "yes"
vim.opt.backupcopy = "yes"

vim.opt.mouse = ""

vim.api.nvim_set_option("clipboard", "unnamed")
