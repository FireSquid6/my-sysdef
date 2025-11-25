local wk = require("which-key")

vim.keymap.set({ "i", "n" }, "<esc>", "<cmd>noh<cr><esc>")
vim.keymap.set({ "i", "n" }, "<C-h>", "<C-w>h")
vim.keymap.set({ "i", "n" }, "<C-j>", "<C-w>j")
vim.keymap.set({ "i", "n" }, "<C-k>", "<C-w>k")
vim.keymap.set({ "i", "n" }, "<C-l>", "<C-w>l")

vim.keymap.set("t", "<C-n>", "<C-\\><C-n>")
vim.keymap.set("t", "<C-h>", "<C-\\><C-n><C-w>h")
vim.keymap.set("t", "<C-j>", "<C-\\><C-n><C-w>j")
vim.keymap.set("t", "<C-k>", "<C-\\><C-n><C-w>k")
vim.keymap.set("t", "<C-l>", "<C-\\><C-n><C-w>l")

vim.keymap.set("v", "<leader>c", '"+y', { desc = "Copy to clipboard" })
vim.keymap.set("n", "<leader>p", '"+p', { desc = "Paste from clipboard" })

vim.api.nvim_create_autocmd("LspAttach", {
  group = vim.api.nvim_create_augroup("UserLspConfig", {}),
  callback = function(ev)
    -- Enable completion triggered by <c-x><c-o>
    vim.bo[ev.buf].omnifunc = "v:lua.vim.lsp.omnifunc"

    -- Buffer local mappings.
    -- See `:help vim.lsp.*` for documentation on any of the below functions
    local opts = { buffer = ev.buf }

    wk.add({
      { "gD", vim.lsp.buf.declaration,     desc = "Go to Declaration" },
      { "gd", vim.lsp.buf.definition,      desc = "Go to Definition" },
      { "gi", vim.lsp.buf.implementation,  desc = "Go to Implementation" },
      { "gr", vim.lsp.buf.references,      desc = "Go to References" },
      { "gt", vim.lsp.buf.type_definition, desc = "Go to Type Definition" },
    })

    wk.add({
      { "<leader>l",  group = "LSP" },
      { "<leader>la", vim.lsp.buf.code_action,                    desc = "Code Action" },
      { "<leader>ld", vim.diagnostic.open_float,                  desc = "Line Diagnostics" },
      { "<leader>lf", vim.lsp.buf.format,                         desc = "Format" },
      { "<leader>lh", require("pretty_hover").hover,              desc = "Hover" },
      { "<leader>ln", vim.lsp.buf.rename,                         desc = "Rename" },
    })
  end,
})
