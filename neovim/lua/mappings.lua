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

-- general
wk.add({
  { "<leader>c",   function() Snacks.bufdelete() end,                desc = "Close Buffer" },
  { "<leader>g",   function() Snacks.lazygit() end,                  desc = "LazyGit" },
  { "<leader>q",   "<cmd>q<cr>",                                     desc = "Quit Files" },
  { "<leader>w",   "<cmd>wa<cr>",                                    desc = "Write Files" },
  { "<leader>s",   function() Snacks.picker.spelling() end,          desc = "Spell Suggest" },
})

-- find
wk.add({
  { "<leader>f",   group = "Find" },
  { "<leader>f/",  function() Snacks.picker.lines() end,                    desc = "Search Current Buffer" },
  { "<leader>fb",  function() Snacks.picker.buffers() end,                  desc = "Find Buffers" },
  { "<leader>fc",  function() Snacks.picker.commands() end,                 desc = "Search Commands" },
  { "<leader>fe",  function() Snacks.picker.diagnostics() end,              desc = "Search Diagnostics" },
  { "<leader>ff",  function() Snacks.picker.files() end,                    desc = "Find Files" },
  { "<leader>fi",  function() Snacks.picker.lsp_references() end,           desc = "Search References" },
  { "<leader>fl",  function() Snacks.picker.lsp_symbols() end,              desc = "Search LSP Symbols" },
  { "<leader>fm",  function() Snacks.picker.marks() end,                    desc = "Search Marks" },
  { "<leader>fr",  function() Snacks.picker.registers() end,                desc = "Search Registers" },
  { "<leader>fs",  function() Snacks.picker.lsp_workspace_symbols() end,    desc = "Search LSP Workspace Symbols" },
  { "<leader>fw",  function() Snacks.picker.grep() end,                     desc = "Find Words" },
})

-- ui
wk.add({
  { "<leader>u",   group = "UI" },
  { "<leader>ut",  group = "Colorscheme" },
  { "<leader>utd", "<cmd>colorscheme tokyonight-day<cr>",   desc = "Day Theme" },
  { "<leader>utn", "<cmd>colorscheme tokyonight-night<cr>", desc = "Night Theme" },
  { "<leader>uts", "<cmd>colorscheme tokyonight-storm<cr>", desc = "Storm Theme" },
})

-- yazi
wk.add({
  { "<leader>e", "<cmd>Yazi<cr>",     mode = { "n", "v" }, desc = "Open yazi at the current file" },
  { "<leader>k", "<cmd>Yazi cwd<cr>",                      desc = "Open the file manager in nvim's working directory" },
})

-- debugger
wk.add({
  {
      "<leader>d",
      group = "Debugger",
      nowait = true,
      remap = false,
  },
  {
      "<leader>dt",
      function()
          require("dap").toggle_breakpoint()
      end,
      desc = "Toggle Breakpoint",
      nowait = true,
      remap = false,
  },
  {
      "<leader>dc",
      function()
          require("dap").continue()
      end,
      desc = "Continue",
      nowait = true,
      remap = false,
  },
  {
      "<leader>di",
      function()
          require("dap").step_into()
      end,
      desc = "Step Into",
      nowait = true,
      remap = false,
  },
  {
      "<leader>do",
      function()
          require("dap").step_over()
      end,
      desc = "Step Over",
      nowait = true,
      remap = false,
  },
  {
      "<leader>du",
      function()
          require("dap").step_out()
      end,
      desc = "Step Out",
      nowait = true,
      remap = false,
  },
  {
      "<leader>dr",
      function()
          require("dap").repl.open()
      end,
      desc = "Open REPL",
      nowait = true,
      remap = false,
  },
  {
      "<leader>dl",
      function()
          require("dap").run_last()
      end,
      desc = "Run Last",
      nowait = true,
      remap = false,
  },
  {
      "<leader>dq",
      function()
          require("dap").terminate()
          require("dapui").close()
          require("nvim-dap-virtual-text").toggle()
      end,
      desc = "Terminate",
      nowait = true,
      remap = false,
  },
  {
      "<leader>db",
      function()
          require("dap").list_breakpoints()
      end,
      desc = "List Breakpoints",
      nowait = true,
      remap = false,
  },
  {
      "<leader>de",
      function()
          require("dap").set_exception_breakpoints({ "all" })
      end,
      desc = "Set Exception Breakpoints",
      nowait = true,
      remap = false,
  },
})

-- lsp (buffer-local, set on attach)
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
      { "<leader>li", "<cmd>LspInfo<cr>",                         desc = "Lsp Info" },
      { "<leader>ln", vim.lsp.buf.rename,                         desc = "Rename" },
    })
  end,
})
