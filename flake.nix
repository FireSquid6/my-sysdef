{
  description = "Personal NixOS Hyprland desktop and standalone Home Manager configurations";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    # Personal application forks; retain Hermes' coordinated dependency lock.
    hermes.url = "github:firesquid6/hermes-agent";
    herdr-app = {
      url = "git+https://github.com/firesquid6/herdr-app?submodules=1";
      flake = false;
    };
    herdr-core = {
      url = "git+https://github.com/firesquid6/herdr-core?submodules=1";
      flake = false;
    };
    # NixOS desktop needs Hyprland's Lua API and AGS 3; keep standalone HM stable.
    nixpkgs-desktop.url = "github:NixOS/nixpkgs/nixos-unstable";
    home-manager-desktop = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs-desktop";
    };
    ags = {
      url = "github:Aylur/ags";
      inputs.nixpkgs.follows = "nixpkgs-desktop";
      inputs.astal.inputs.nixpkgs.follows = "nixpkgs-desktop";
    };
    home-manager = {
      url = "github:nix-community/home-manager/release-25.11";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      nixpkgs-desktop,
      home-manager-desktop,
      ags,
      home-manager,
      hermes,
      herdr-app,
      herdr-core,
    }:
    let
      inherit (nixpkgs) lib;
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = lib.genAttrs systems;
      hosts = import ./nix/hosts.nix;
      packageSources = { inherit hermes herdr-app herdr-core; };
      pkgsFor =
        system:
        import nixpkgs {
          inherit system;
          # Existing applications include Discord, Steam, Spotify, Obsidian and unrar.
          # Explicit policy decision: see the assumptions record; no credentials here.
          config.allowUnfree = true;
        };
      desktopPkgsFor =
        system:
        import nixpkgs-desktop {
          inherit system;
          config.allowUnfree = true;
        };
      # This inventory includes x86-only applications and upstream binaries.
      desktopPackages =
        system:
        lib.optionalAttrs (system == "x86_64-linux") (
          import ./nix/packages {
            pkgs = desktopPkgsFor system;
            inherit packageSources;
          }
        );
      mkHome =
        spec:
        home-manager.lib.homeManagerConfiguration {
          pkgs = pkgsFor spec.system;
          modules = [
            ./nix/modules
            spec.profile
            {
              home = { inherit (spec) username homeDirectory; };
              personal.checkout = spec.checkout;
            }
          ];
        };
      homes = lib.mapAttrs (_: mkHome) hosts;
    in
    {
      homeManagerModules.default = import ./nix/modules;
      homeConfigurations = homes;

      nixosModules.desktop = { config, pkgs, ... }: {
        imports = [
          ./nix/nixos
          home-manager-desktop.nixosModules.home-manager
        ];
        environment.systemPackages = [ ags.packages.${pkgs.stdenv.hostPlatform.system}.ags ];
        home-manager = {
          useGlobalPkgs = true;
          useUserPackages = true;
          users.${config.personal.system.username} = {
            _module.args = { inherit packageSources; };
            imports = [ ./nix/home/workstation.nix ];
            home = {
              inherit (config.personal.system) username;
              homeDirectory = "/home/${config.personal.system.username}";
            };
            personal.checkout = config.personal.system.checkout;
          };
        };
      };
      nixosConfigurations.deisslaptop = nixpkgs-desktop.lib.nixosSystem {
        system = "x86_64-linux";
        modules = [
          self.nixosModules.desktop
          ./nix/nixos/hosts/deisslaptop.nix
        ];
      };

      packages = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
        in
        desktopPackages system
        // {
          ags-desktop = ags.packages.${system}.ags;
          inherit (home-manager.packages.${system}) home-manager;
          default = self.packages.${system}.home-manager;
          prepare-home = pkgs.writeShellApplication {
            name = "prepare-home";
            runtimeInputs = [
              pkgs.python3
              pkgs.nix
            ];
            text = ''exec python3 ${./scripts/prepare-home.py} "$@"'';
          };
        }
      );
      apps = forAllSystems (system: {
        default = self.apps.${system}.home-manager;
        home-manager = {
          type = "app";
          program = "${self.packages.${system}.home-manager}/bin/home-manager";
        };
        prepare-home = {
          type = "app";
          program = "${self.packages.${system}.prepare-home}/bin/prepare-home";
        };
      });
      formatter = forAllSystems (system: (pkgsFor system).nixfmt-rfc-style);
      devShells = forAllSystems (system: {
        default = (pkgsFor system).mkShell {
          packages = with (pkgsFor system); [
            nixfmt-rfc-style
            statix
            deadnix
            python3
            bun
          ];
        };
      });
      checks = forAllSystems (
        system:
        lib.mapAttrs' (
          name: home:
          lib.nameValuePair ("home-" + lib.replaceStrings [ "@" ] [ "-" ] name) home.activationPackage
        ) (lib.filterAttrs (name: _: hosts.${name}.system == system) homes)
        // {
          # Exercise optional modules too; --no-build validates without installing.
          all-modules =
            (mkHome {
              inherit system;
              username = "firesquid";
              homeDirectory = "/home/firesquid";
              checkout = "/home/firesquid/my-sysdef";
              profile = { ... }: {
                imports = [ ./nix/profiles/workstation.nix ];
                personal.modules.gamedev.enable = true;
              };
            }).activationPackage;
          migration-tests =
            (pkgsFor system).runCommand "home-migration-tests"
              {
                nativeBuildInputs = [ (pkgsFor system).python3 ];
              }
              ''
                export HOME="$TMPDIR/home"
                export PREPARE_HOME_SCRIPT=${./scripts/prepare-home.py}
                mkdir -p "$HOME"
                python3 ${./test/prepare_home_test.py}
                touch "$out"
              '';
        }
        // lib.optionalAttrs (system == "x86_64-linux") {
          nixos-desktop = self.nixosConfigurations.deisslaptop.config.system.build.toplevel;
          desktop-contract = import ./nix/tests/desktop-contract.nix {
            inherit packageSources;
            pkgs = desktopPkgsFor system;
            inherit (self.nixosConfigurations.deisslaptop) config;
          };
          ags-bundle =
            (desktopPkgsFor system).runCommand "sysdef-ags-bundle"
              {
                nativeBuildInputs = [ self.packages.${system}.ags-desktop ];
              }
              ''
                ags bundle ${./ags}/app.tsx "$out" --gtk 4
                test -s "$out"
              '';
          desktop-apps = import ./nix/packages/desktop-apps/checks.nix {
            pkgs = desktopPkgsFor system;
          };
          browser-use = self.packages.${system}.browser-use.tests.smoke;
          md-to-pdf = self.packages.${system}.md-to-pdf.tests.render;
          excalidraw = self.packages.${system}.tommy-excalidraw-cli.tests.render;
          hermes-launcher = self.packages.${system}.hermes.tests.launcher;
        }
      );
    };
}
