{
  description = "Shared Linux desktop/user configuration with standalone Nix and Home Manager";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    hermes.url = "github:firesquid6/hermes-agent";
    herdr-app = {
      url = "git+https://github.com/firesquid6/herdr-app?submodules=1";
      flake = false;
    };
    herdr-core = {
      url = "git+https://github.com/firesquid6/herdr-core?submodules=1";
      flake = false;
    };
    nixgl = {
      url = "github:nix-community/nixGL/4306ae1d15adf3d386f1462b330d4f2648404711";
      flake = false;
    };
    # Shared desktop runtime needs Hyprland's Lua API and AGS 3. Headless
    # profiles retain their stable package/module pins.
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
      nixgl,
    }:
    let
      inherit (nixpkgs) lib;
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = lib.genAttrs systems;
      hosts = import ./nix/hosts.nix;
      workstations = lib.filterAttrs (_: spec: spec.workstation or false) hosts;
      packageSources = { inherit hermes herdr-app herdr-core; };
      pkgsFor =
        system:
        import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };
      desktopPkgsFor =
        system:
        import nixpkgs-desktop {
          inherit system;
          config.allowUnfree = true;
        };
      desktopPackages =
        system:
        lib.optionalAttrs (system == "x86_64-linux") (
          import ./nix/packages {
            pkgs = desktopPkgsFor system;
            inherit packageSources;
          }
        );
      workstationBundles = lib.mapAttrs (
        _: host:
        let
          pkgs = desktopPkgsFor host.system;
        in
        import ./nix/packages/workstation.nix {
          inherit pkgs host;
          inherit (ags.packages.${host.system}) ags;
          applications = desktopPackages host.system;
          graphics = import ./nix/graphics {
            inherit pkgs nixgl;
            settings = host.graphics;
          };
        }
      ) workstations;
      mkHome =
        spec:
        let
          workstation = spec.workstation or false;
          manager = if workstation then home-manager-desktop else home-manager;
        in
        manager.lib.homeManagerConfiguration {
          pkgs = if workstation then desktopPkgsFor spec.system else pkgsFor spec.system;
          extraSpecialArgs = lib.optionalAttrs workstation {
            workstationBundle = workstationBundles."${spec.username}@${spec.hostname}";
          };
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

      packages = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
        in
        desktopPackages system
        // lib.mapAttrs' (
          name: host: lib.nameValuePair "${host.hostname}-apps" workstationBundles.${name}
        ) (lib.filterAttrs (_: host: host.system == system) workstations)
        // {
          ags-desktop = ags.packages.${system}.ags;
          inherit (home-manager-desktop.packages.${system}) home-manager;
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
        // lib.mapAttrs' (
          name: host:
          lib.nameValuePair "${host.hostname}-contract" (
            import ./nix/tests/workstation-contract.nix {
              pkgs = desktopPkgsFor system;
              bundle = workstationBundles.${name};
            }
          )
        ) (lib.filterAttrs (_: host: host.system == system) workstations)
        // {
          all-modules =
            (mkHome {
              inherit system;
              username = "firesquid";
              homeDirectory = "/home/firesquid";
              checkout = "/home/firesquid/sysdef";
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
          desktop-contract = import ./nix/tests/desktop-contract.nix {
            pkgs = desktopPkgsFor system;
            inherit packageSources;
            hosts = workstations;
            outputs = self;
            homes = lib.mapAttrs (name: _: homes.${name}.config) workstations;
            bundles = workstationBundles;
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
          graphics-wrapper = import ./nix/tests/graphics-wrapper.nix {
            pkgs = desktopPkgsFor system;
            inherit nixgl;
          };
          desktop-apps = import ./nix/packages/desktop-apps/checks.nix {
            pkgs = desktopPkgsFor system;
          };
          browser-use = self.packages.${system}.browser-use.tests.smoke;
          md-to-pdf = self.packages.${system}.md-to-pdf.tests.render;
          excalidraw = self.packages.${system}.tommy-excalidraw-cli.tests.render;
          hermes-launcher = self.packages.${system}.hermes.tests.launcher;
          hermes-opus = self.packages.${system}.hermes.tests.opus;
        }
      );
    };
}
