require("lazy").setup({
  {
    "folke/which-key.nvim",
    tag = "v3.17.0",
    event = "VeryLazy",
    init = function()
      vim.o.timeout = true
      vim.o.timeoutlen = 200
    end,
  },
  "folke/tokyonight.nvim",

  "nvim-lua/popup.nvim",
  "nvim-lua/plenary.nvim",
  {
    "mhinz/vim-startify",
  },
  {
    "nvim-telescope/telescope.nvim",
    tag = "0.1.6",
    dependencies = { "nvim-lua/plenary.nvim" },
    keys = {
      { "<leader>c",   "<cmd>bdelete<cr>",                                  desc = "Close Buffer" },
      { "<leader>l",   group = "LSP" },
      { "<leader>f",   group = "Find" },
      { "<leader>f/",  "<cmd>Telescope current_buffer_fuzzy_find<cr>",      desc = "Search Current Buffer" },
      { "<leader>fb",  "<cmd>Telescope buffers<cr>",                        desc = "Find Buffers" },
      { "<leader>fc",  "<cmd>Telescope commands<cr>",                       desc = "Search Commands" },
      { "<leader>fe",  "<cmd>Telescope diagnostics<cr>",                    desc = "Search Diagnostics" },
      { "<leader>ff",  "<cmd>Telescope find_files<cr>",                     desc = "Find Files" },
      { "<leader>fi",  "<cmd>Telescope lsp_incoming_calls<cr>",             desc = "Search Incoming Calls" },
      { "<leader>fl",  "<cmd>Telescope lsp_document_symbols<cr>",           desc = "Search LSP Symbols" },
      { "<leader>fm",  "<cmd> Telescope marks<cr>",                         desc = "Search Marks" },
      { "<leader>fo",  "<cmd>Telescope lsp_outgoing_calls<cr>",             desc = "Search Outgoing Calls" },
      { "<leader>fr",  "<cmd> Telescope registers<cr>",                     desc = "Search Registers" },
      { "<leader>fs",  "<cmd>Telescope lsp_dynamic_workspace_symbols<cr>",  desc = "Search LSP Workspace Symbols" },
      { "<leader>fw",  "<cmd>Telescope live_grep<cr>",                      desc = "Find Words" },
      { "<leader>g",   "<cmd>LazyGit<cr>",                                  desc = "LazyGit" },
      { "<leader>q",   "<cmd>q<cr>",                                        desc = "Quit Files" },
      { "<leader>s",   "<cmd>Telescope spell_suggest<cr>",                  desc = "Spell Suggest" },
      { "<leader>u",   group = "UI" },
      { "<leader>ut",  group = "Colorscheme" },
      { "<leader>utd", "<cmd>colorscheme tokyonight-day<cr>",               desc = "Day Theme" },
      { "<leader>utn", "<cmd>colorscheme tokyonight-night<cr>",             desc = "Night Theme" },
      { "<leader>uts", "<cmd>colorscheme tokyonight-storm<cr>",             desc = "Storm Theme" },
      { "<leader>w",   "<cmd>wa<cr>",                                       desc = "Write Files" },
      { "<leader>li",  "<cmd>LspInfo<cr>",                                  desc = "Lsp Info" },
    },
    config = function()
      require("telescope").setup({
        defaults = {
          layout_config = {
            prompt_position = "top",
          },
          file_ignore_patterns = { "node_modules", ".git" },
        },
        pickers = {
          live_grep = {
            hidden = true,
          },
        },
      })
    end,
  },

  "neovim/nvim-lspconfig",

  {
    "mhartington/formatter.nvim",
    config = function()
      -- Utilities for creating configurations
      local util = require("formatter.util")

      -- Provides the Format, FormatWrite, FormatLock, and FormatWriteLock commands
      require("formatter").setup({
        -- Enable or disable logging
        logging = true,
        -- Set the log level
        log_level = vim.log.levels.WARN,
        -- All formatter configurations are opt-in
        filetype = {
          -- Formatter configurations for filetype "lua" go here
          -- and will be executed in order
          go = {
            require("formatter.filetypes.go").gofmt,
          },
          lua = {
            -- "formatter.filetypes.lua" defines default configurations for the
            -- "lua" filetype
            require("formatter.filetypes.lua").stylua,
          },
          javascript = {
            -- prettierd
            function()
              return {
                exe = "prettierd",
                args = { vim.api.nvim_buf_get_name(0) },
                stdin = true
              }
            end
          },
          typescript = {
            -- prettierd
            function()
              return {
                exe = "prettierd",
                args = { vim.api.nvim_buf_get_name(0) },
                stdin = true
              }
            end
          },
          nix = {
            -- nixfmt
            function()
              return {
                exe = "nixfmt",
                args = { vim.api.nvim_buf_get_name(0) },
                stdin = true
              }
            end
          },
          rust = {
            -- rustfmt
            function()
              return {
                exe = "rustfmt",
                args = { vim.api.nvim_buf_get_name(0) },
                stdin = true
              }
            end
          },
          -- Use the special "*" filetype for defining formatter configurations on
          -- any filetype
          ["*"] = {
            -- "formatter.filetypes.any" defines default configurations for any
            -- filetype
            require("formatter.filetypes.any").remove_trailing_whitespace,
          },
        },
      })
    end,
  },
  {
    "folke/snacks.nvim",
  },
  {
    "Fildo7525/pretty_hover",
    event = "LSPAttach",
    opts = {},
  },
  {
    "nvim-treesitter/nvim-treesitter",
    build = ":TSUpdate",
    config = function()
      local configs = require("nvim-treesitter.configs")

      configs.setup({
        ensure_installed = {
          "c",
          "lua",
          "vim",
          "vimdoc",
          "query",
          "elixir",
          "heex",
          "javascript",
          "html",
          "tsx",
          "typescript",
        },
        sync_install = false,
        highlight = { enable = true },
        indent = { enable = true },
      })
    end,
  },

  "hrsh7th/nvim-cmp",
  "hrsh7th/cmp-nvim-lsp",
  "hrsh7th/cmp-vsnip",
  "hrsh7th/vim-vsnip",
  "hrsh7th/cmp-buffer",
  "hrsh7th/cmp-path",
  "hrsh7th/cmp-cmdline",

  {
    "lukas-reineke/indent-blankline.nvim",

    config = function()
      require("ibl").setup()
    end,
  },
  {
    "OlegGulevskyy/better-ts-errors.nvim",
    dependencies = { "MunifTanjim/nui.nvim" },
    config = {
      keymaps = {
        toggle = "<leader>ud",
        go_to_definition = "<leader>dx",
      },
    },
  },

  "nvim-tree/nvim-web-devicons",
  {
    "nvim-lualine/lualine.nvim",
    dependencies = { "nvim-tree/nvim-web-devicons" },
    config = function()
      require("lualine").setup()
    end,
  },
  -- {
  --   "stevearc/oil.nvim",
  --   config = function()
  --     require("oil").setup({
  --       view_options = {
  --         show_hidden = true,
  --       },
  --     })
  --   end,
  -- },
  {
    "mikavilpas/yazi.nvim",
    event = "VeryLazy",
    dependencies = {
      -- check the installation instructions at
      -- https://github.com/folke/snacks.nvim
      -- "folke/snacks.nvim"
    },
    keys = {
      -- 👇 in this section, choose your own keymappings!
      {
        "<leader>e",
        mode = { "n", "v" },
        "<cmd>Yazi<cr>",
        desc = "Open yazi at the current file",
      },
      {
        -- Open in the current working directory
        "<leader>k",
        "<cmd>Yazi cwd<cr>",
        desc = "Open the file manager in nvim's working directory",
      },
    },
    ---@type YaziConfig | {}
    opts = {
      -- if you want to open yazi instead of netrw, see below for more info
      open_for_directories = true,
      keymaps = {
        show_help = "<f1>",
      },
    },
    -- 👇 if you use `open_for_directories=true`, this is recommended
    init = function()
      -- More details: https://github.com/mikavilpas/yazi.nvim/issues/802
      -- vim.g.loaded_netrw = 1
      vim.g.loaded_netrwPlugin = 1
    end,
  },
  {
    "kdheepak/lazygit.nvim",
    cmd = {
      "LazyGit",
      "LazyGitConfig",
      "LazyGitCurrentFile",
      "LazyGitFilter",
      "LazyGitFilterCurrentFile",
    },
    -- optional for floating window border decoration
    dependencies = {
      "nvim-lua/plenary.nvim",
    },
  },
  {
    "windwp/nvim-autopairs",
    event = "InsertEnter",
    config = true,
    -- use opts = {} for passing setup options
    -- this is equalent to setup({}) function
  },
  {
    "numToStr/Comment.nvim",
    opts = {
      -- add any options here
    },
    lazy = false,
  },
  {
    "nvimtools/none-ls.nvim",
    config = function()
      local null_ls = require("null-ls")

      null_ls.setup({
        sources = {
          -- null_ls.builtins.completion.spell,
        },
      })
    end,
  },
  {
    "f-person/git-blame.nvim",
  },
  {
    "firesquid6/nvim-yati",
    config = function()
      require("nvim-treesitter.configs").setup({
        yati = {
          enable = true,
          disable = { "gdscript", "go", "lua", "json", "cpp", },
          -- Whether to enable lazy mode (recommend to enable this if bad indent happens frequently)
          default_lazy = true,
          -- Determine the fallback method used when we cannot calculate indent by tree-sitter
          --   "auto": fallback to vim auto indent
          --   "asis": use current indent as-is
          --   "cindent": see `:h cindent()`
          -- Or a custom function return the final indent result.
          default_fallback = "auto",
          suppress_conflict_warning = false,
        },
        indent = {
          enable = true, -- disable builtin indent module
          disable = { "html", "javascript", "typescript", "tsx", "python" },
        },
      })
    end,
  },
  {
    "windwp/nvim-ts-autotag",
    config = function()
      require("nvim-ts-autotag").setup()
    end,
  },
  {
    "chentoast/marks.nvim",
    config = function()
      require("marks").setup()
    end,
  },
  {
    "folke/lazydev.nvim",
    ft = "lua",
    opts = {
      library = {
        { path = "luvit-meta/library", words = { "vim%.uv " } },
      },
    },
  },
  { "Bilal2453/luvit-meta", lazy = true }, -- optional `vim.uv` typings
  {
    "karb94/neoscroll.nvim",
    config = function()
      require("neoscroll").setup({})
    end,
  },
  {
    "davidmh/mdx.nvim",
    config = true,
  },
  {
    "epwalsh/obsidian.nvim",
    version = "*",
    lazy = true,
    ft = "markdown",

    dependencies = {
      "nvim-lua/plenary.nvim",
    },
    opts = {
      workspaces = {
        {
          name = "notes",
          path = "~/notes",
        },
      },
      ui = {
        enable = false,
      },
      daily_notes = {
        folder = "journal",
        default_tags = { },
      }
    },
  },
  {
  "hat0uma/csvview.nvim",
  ---@module "csvview"
  ---@type CsvView.Options
  opts = {
    parser = { comments = { "#", "//" } },
    keymaps = {
      -- Text objects for selecting fields
      textobject_field_inner = { "if", mode = { "o", "x" } },
      textobject_field_outer = { "af", mode = { "o", "x" } },
      -- Excel-like navigation:
      -- Use <Tab> and <S-Tab> to move horizontally between fields.
      -- Use <Enter> and <S-Enter> to move vertically between rows and place the cursor at the end of the field.
      -- Note: In terminals, you may need to enable CSI-u mode to use <S-Tab> and <S-Enter>.
      jump_next_field_end = { "<Tab>", mode = { "n", "v" } },
      jump_prev_field_end = { "<S-Tab>", mode = { "n", "v" } },
      jump_next_row = { "<Enter>", mode = { "n", "v" } },
      jump_prev_row = { "<S-Enter>", mode = { "n", "v" } },
    },
  },
  cmd = { "CsvViewEnable", "CsvViewDisable", "CsvViewToggle" },
}
})
