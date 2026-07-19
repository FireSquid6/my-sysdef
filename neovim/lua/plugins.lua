
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
    lazy = false,
    opts = {
      picker = {
        layout = {
          preset = "telescope",
        },
      },
      dashboard = {
        preset = {
          header = table.concat({
            [[     ┌────────────┐]],
            [[    /             │]],
            [[┌──┘              │]],
            [[│   ╔═════════╗   │]],
            [[└───╚═╗     ╔═╝───┘]],
            [[   ╔══╝     ╚══╗   ]],
            [[   ╚═══════════╝   ]],
            [[▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀]],
          }, "\n"),
        },
      },
      indent = {},
      scroll = {},
      lazygit = {},
    },
  },
  {
    "Fildo7525/pretty_hover",
    event = "LSPAttach",
    opts = {},
  },
  {
    "nvim-treesitter/nvim-treesitter",
    branch = "main",
    lazy = "false",
  },

  "hrsh7th/nvim-cmp",
  "hrsh7th/cmp-nvim-lsp",
  "hrsh7th/cmp-vsnip",
  "hrsh7th/vim-vsnip",
  "hrsh7th/cmp-buffer",
  "hrsh7th/cmp-path",
  "hrsh7th/cmp-cmdline",

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

  {
    "folke/sidekick.nvim",
    -- Always installed, but only loaded/configured from ai-setup.lua
    config = {
      nes = { enabled = false },
    }
    lazy = true,
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
  -- {
  --   "firesquid6/nvim-yati",
  --   config = function()
  --     require("nvim-treesitter.configs").setup({
  --       yati = {
  --         enable = true,
  --         disable = { "gdscript", "go", "lua", "json", "cpp", },
  --         -- Whether to enable lazy mode (recommend to enable this if bad indent happens frequently)
  --         default_lazy = true,
  --         -- Determine the fallback method used when we cannot calculate indent by tree-sitter
  --         --   "auto": fallback to vim auto indent
  --         --   "asis": use current indent as-is
  --         --   "cindent": see `:h cindent()`
  --         -- Or a custom function return the final indent result.
  --         default_fallback = "auto",
  --         suppress_conflict_warning = false,
  --       },
  --       indent = {
  --         enable = true, -- disable builtin indent module
  --         disable = { "html", "javascript", "typescript", "tsx", "python" },
  --       },
  --     })
  --   end,
  -- },
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
    "mason-org/mason.nvim",
    opts = {
      ui = {
        icons = {
          package_installed = "✓",
          package_pending = "➜",
          package_uninstalled = "✗"
        },
      },
    },
  },
  {
    "mfussenegger/nvim-dap",
    event = "VeryLazy",
    dependencies = {
      "rcarriga/nvim-dap-ui",
      "nvim-neotest/nvim-nio",
      "jay-babu/mason-nvim-dap.nvim",
      "theHamsta/nvim-dap-virtual-text",
    },
  },
})
