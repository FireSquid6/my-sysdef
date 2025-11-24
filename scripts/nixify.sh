#!/usr/bin/env bash


TYPE=$1  # flake or shell
NAME=$2  # name of the flake or shell.nix file

function copy_file() {
  # type should be either flake or shell
  if [ "$TYPE" != "flake" ] && [ "$TYPE" != "shell" ]; then
    echo "No type specified. Assuming that this project already has a flake.nix or shell.nix"
    return 1
  fi

  # the name file should exist
  FILEPATH="$SYSTEM_CONFIG_DIR/dev$(echo $TYPE)s/$NAME.nix"
  if [ ! -f "$FILEPATH" ]; then
    echo "File $FILEPATH does not exist"
    return 1
  fi

  # copy the file to the current directory
  cp "$FILEPATH" ./"$TYPE".nix
  echo "Copied $FILEPATH to ./$TYPE.nix"
}




function init_envrc() {
  # check if in a git repository
  if [ ! -d .git ]; then
    git init
  fi

  if test -f ./flake.nix; then
    echo "Found a flake.nix. Using nix flake for the .envrc"
    touch .envrc
    echo -e "use flake" >> .envrc
  elif test -f ./shell.nix; then
    echo "Found a shell.nix. Using nix-shell for the .envrc"
    touch .envrc
    echo -e "use nix" >> .envrc
  else 
    echo "No flake.nix or shell.nix found. No envrc to init."
    exit 1
  fi


  if grep -Fxq ".envrc" .gitignore
  then
    echo ".envrc already in .gitignore"
  else
    echo ".envrc not in .gitignore. Adding it."
    echo ".envrc" >> .gitignore
  fi

  if grep -Fxq ".direnv" .gitignore
  then
    echo ".direnvalready in .gitignore"
  else
    echo ".direnv not in .gitignore. Adding it."
    echo ".direnv" >> .gitignore
  fi


}

copy_file
init_envrc
git add .

direnv allow 
