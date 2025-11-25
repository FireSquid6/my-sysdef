local lspconfig = require("lspconfig")
local util = require("lspconfig.util")

lspconfig.pyright.setup({})
lspconfig.vtsls.setup({})
lspconfig.rust_analyzer.setup({
	-- Server-specific settings. See `:help lspconfig-setup`
	settings = {
		["rust-analyzer"] = {},
	},
})
lspconfig.gdscript.setup({
	root_dir = util.root_pattern("project.godot"),
})
lspconfig.gopls.setup({})
lspconfig.elixirls.setup({
  cmd = { "elixir-ls" },
})

lspconfig.ccls.setup({
  root_dir = util.root_pattern(".ccls", ".git", "main.cpp", "flake.nix")
})
lspconfig.arduino_language_server.setup({})
lspconfig.bashls.setup({})
lspconfig.marksman.setup({})
lspconfig.statix.setup({})
lspconfig.tailwindcss.setup({
  filetypes = { "html", "css", "typescriptreact" },
})


local cmp = require("cmp")
cmp.setup({
	snippet = {
		expand = function(args)
			vim.fn["vsnip#anonymous"](args.body)
		end,
	},
	window = {
	},
	mapping = cmp.mapping.preset.insert({
		["<C-b>"] = cmp.mapping.scroll_docs(-4),
		["<C-f>"] = cmp.mapping.scroll_docs(4),
		["<C-Space>"] = cmp.mapping.complete(),
		["<C-e>"] = cmp.mapping.abort(),
		["<Tab>"] = cmp.mapping.confirm({ select = true }),
	}),
	sources = cmp.config.sources({
		{ name = "nvim_lsp" },
		{ name = "vsnip" },
	}, {
		{ name = "buffer" },
	}),
})

cmp.setup.filetype("gitcommit", {
	sources = cmp.config.sources({
		{ name = "git" },
	}, {
		{ name = "buffer" },
	}),
})

-- Use buffer source for `/` and `?` (if you enabled `native_menu`, this won't work anymore).
cmp.setup.cmdline({ "/", "?" }, {
	mapping = cmp.mapping.preset.cmdline(),
	sources = {
		{ name = "buffer" },
	},
})

cmp.setup.filetype("markdown", {
  sources = cmp.config.sources({
    { name = "nvim_lsp" },
  }),
})

-- Use cmdline & path source for ':' (if you enabled `native_menu`, this won't work anymore).
cmp.setup.cmdline(":", {
	mapping = cmp.mapping.preset.cmdline(),
	sources = cmp.config.sources({
		{ name = "path" },
	}, {
		{ name = "cmdline" },
	}),
	matching = { disallow_symbol_nonprefix_matching = false },
})

require("cmp_nvim_lsp").default_capabilities()
