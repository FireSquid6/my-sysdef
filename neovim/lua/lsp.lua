local util = require("lspconfig.util")

vim.lsp.config("rust_analyzer", {
	settings = {
		["rust-analyzer"] = {},
	},
})

vim.lsp.config("gdscript", {
	root_dir = util.root_pattern("project.godot"),
})

vim.lsp.config("elixirls", {
	cmd = { "elixir-ls" },
})

vim.lsp.config("ccls", {
	root_dir = util.root_pattern(".ccls", ".git", "main.cpp", "flake.nix"),
})

vim.lsp.config("tailwindcss", {
	filetypes = { "html", "css", "typescriptreact" },
})

vim.lsp.enable({
	"pyright",
	"vtsls",
	"rust_analyzer",
	"gdscript",
	"gopls",
	"elixirls",
	"ccls",
	"arduino_language_server",
	"bashls",
	"marksman",
	"statix",
	"tailwindcss",
	"jdtls",
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
