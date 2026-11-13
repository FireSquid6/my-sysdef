{
  description = "Personal Linux configuration with Nix flakes and standalone Home Manager";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    home-manager = {
      url = "github:nix-community/home-manager/release-25.11";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      home-manager,
    }:
    let
      inherit (nixpkgs) lib;
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = lib.genAttrs systems;
      hosts = import ./nix/hosts.nix;
      pkgsFor =
        system:
        import nixpkgs {
          inherit system;
          # Existing applications include Discord, Steam, Spotify, Obsidian and unrar.
          # Explicit policy decision: see the assumptions record; no credentials here.
          config.allowUnfree = true;
        };
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

      packages = forAllSystems (
        system:
        let
          pkgs = pkgsFor system;
        in
        {
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
      );
    };
}
