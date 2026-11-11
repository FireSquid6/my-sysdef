---
name: port-fabric-mod-26
description: Port a Fabric mod from Minecraft 1.21.x (Yarn mappings) to Minecraft 26.1+ (unobfuscated Mojang names). Use when migrating a Fabric mod to the new unobfuscated Minecraft versions.
allowed-tools: Bash Read Write Edit Grep Glob WebSearch WebFetch Task
argument-hint: [target-mc-version]
arguments: [mc_version]
---

# Port Fabric Mod to Minecraft 26.1+ (Unobfuscated)

Port this Fabric mod to Minecraft **$mc_version** (default: 26.1.2 if not specified).

Minecraft 26.1+ is **unobfuscated** — Mojang ships the game with real class/method/field names. This eliminates Yarn/Intermediary mappings entirely and changes the build toolchain significantly.

---

## Phase 1: Understand the Current Mod

Before changing anything:

1. Read `gradle/libs.versions.toml`, `build.gradle.kts`, `settings.gradle.kts`
2. Read `fabric.mod.json`, `*.mixins.json`, `*.accesswidener`
3. Find ALL `net.minecraft.*` imports across the codebase:
   ```
   Grep for: ^import net\.minecraft\.
   ```
4. Find ALL `comp_####` intermediate mapping references:
   ```
   Grep for: comp_\d+
   ```
5. Identify all mixin targets and their `@Mixin`, `@Inject`, `@Shadow` annotations

---

## Phase 2: Update Build Configuration

### 2a. `gradle/libs.versions.toml`

| Change | Details |
|--------|---------|
| `minecraft` | Update to target version (e.g., `26.1.2`) |
| `yarn` | **REMOVE entirely** — no mappings needed |
| `fabric-loader` | Update to `>=0.19.2` |
| `fabric-api` | Update to match MC version (e.g., `0.145.4+26.1.2`) |
| `fabric-kotlin` | Update if used (e.g., `1.13.11+kotlin.2.3.21`) |
| `kotlin` | Match fabric-kotlin's bundled version |
| `loom` plugin ID | Change from `fabric-loom` to `net.fabricmc.fabric-loom` |

Remove the `fabric-yarn` library entry from `[libraries]`.

### 2b. `build.gradle.kts`

**Critical changes:**

```kotlin
// 1. REMOVE the mappings line entirely:
//    mappings(libs.fabric.yarn)  ← DELETE THIS

// 2. Replace mod dependency configurations:
//    modImplementation → implementation
//    modCompileOnly → compileOnly
//    modApi → api

// 3. Remove RemapJarTask import and usage:
//    import net.fabricmc.loom.task.RemapJarTask  ← DELETE
//    Replace remapJar references with jar

// 4. Update Java/Kotlin targets to 25 (or 26 if JDK 26 installed):
//    jvmToolchain: JavaLanguageVersion.of(25) or of(26) to match installed JDK
//    JvmTarget: JVM_25 (highest supported in Kotlin 2.3.x)
//    options.release: 25

// 5. Update version string to reflect new MC version

// 6. Shadow/finalJar: use jar output instead of remapJar output
```

**Important notes:**
- `JvmTarget.JVM_25` is the max in Kotlin 2.3.x — `JVM_26` does NOT exist yet
- Set `jvmToolchain` to match the **installed** JDK version (26 if that's what you have)
- Set `options.release` and `jvmTarget` to `25` for bytecode compatibility

### 2c. `settings.gradle.kts`

Usually no changes needed unless it references the loom plugin ID directly.

---

## Phase 3: Update Resource Files

### Access Widener (`*.accesswidener`)

```diff
- accessWidener  v2  named
+ accessWidener  v2  official
```

Also update ALL class/field paths from Yarn names to Mojang names (see Phase 5 mapping table).

### Mixin JSON (`*.mixins.json`)

```diff
- "compatibilityLevel": "JAVA_21"
+ "compatibilityLevel": "JAVA_25"
```

### `fabric.mod.json`

Update dependency versions:
```json
"depends": {
    "fabricloader": ">=0.19.2",
    "minecraft": ">=26.1.2",
    "java": ">=25",
    "fabric-api": "*"
}
```

Remove any dependencies that are now bundled (e.g., `katalis-lib-fabric` or similar runtime providers).

---

## Phase 4: Fix `comp_####` Intermediate Mapping Calls

Search for ALL `comp_\d+` patterns. These are Yarn intermediary names for Java record component accessors. Replace with the real Mojang names.

**How to find the correct name:** Since MC is unobfuscated, you can inspect the actual class in the MC jar:

```bash
# Find the MC jar in Gradle cache:
find ~/.gradle/caches -name "minecraft-merged-deobf-*.jar" | head -1

# Inspect a class to find method names:
JAVA_HOME=/path/to/jdk26 javap -p -cp "$JAR" net.minecraft.server.level.ServerPlayer
```

Common `comp_####` → Mojang name mappings:
- Record accessors use the field name as the method name (e.g., `display()`, `value()`, `id()`, `name()`, `language()`)

---

## Phase 5: Yarn → Mojang Class/Package Name Mapping

This is the **most extensive** change. Every `net.minecraft.*` import using Yarn names must be updated to Mojang official names.

### How to Look Up Mappings

Use the MC jar to find exact class names:

```bash
JAR=$(find ~/.gradle/caches -name "minecraft-merged-deobf-*.jar" | head -1)

# Search for a class by partial name:
jar tf "$JAR" | grep "ServerPlayer"

# Inspect a class for methods/fields:
javap -p -cp "$JAR" net.minecraft.server.level.ServerPlayer
```

### Major Class Renames (Yarn → Mojang)

| Yarn | Mojang |
|------|--------|
| `net.minecraft.text.Text` | `net.minecraft.network.chat.Component` |
| `net.minecraft.text.MutableText` | `net.minecraft.network.chat.MutableComponent` |
| `net.minecraft.text.TextColor` | `net.minecraft.network.chat.TextColor` |
| `net.minecraft.text.ClickEvent` | `net.minecraft.network.chat.ClickEvent` |
| `net.minecraft.text.HoverEvent` | `net.minecraft.network.chat.HoverEvent` |
| `net.minecraft.text.Style` | `net.minecraft.network.chat.Style` |
| `net.minecraft.server.network.ServerPlayerEntity` | `net.minecraft.server.level.ServerPlayer` |
| `net.minecraft.server.command.ServerCommandSource` | `net.minecraft.commands.CommandSourceStack` |
| `net.minecraft.server.PlayerManager` | `net.minecraft.server.players.PlayerList` |
| `net.minecraft.server.BannedPlayerEntry` | `net.minecraft.server.players.UserBanListEntry` |
| `net.minecraft.server.PlayerConfigEntry` | `net.minecraft.server.players.NameAndId` |
| `net.minecraft.sound.SoundEvent` | `net.minecraft.sounds.SoundEvent` |
| `net.minecraft.sound.SoundCategory` | `net.minecraft.sounds.SoundSource` |
| `net.minecraft.sound.SoundEvents` | `net.minecraft.sounds.SoundEvents` |
| `net.minecraft.registry.Registries` | `net.minecraft.core.registries.BuiltInRegistries` |
| `net.minecraft.entity.damage.DamageSource` | `net.minecraft.world.damagesource.DamageSource` |
| `net.minecraft.entity.damage.DamageTracker` | `net.minecraft.world.damagesource.CombatTracker` |
| `net.minecraft.advancement.*` | `net.minecraft.advancements.*` |
| `net.minecraft.advancement.PlayerAdvancementTracker` | `net.minecraft.server.PlayerAdvancements` |
| `net.minecraft.advancement.AdvancementEntry` | `net.minecraft.advancements.AdvancementHolder` |
| `net.minecraft.advancement.AdvancementDisplay` | `net.minecraft.advancements.DisplayInfo` |
| `net.minecraft.advancement.AdvancementProgress` | `net.minecraft.advancements.AdvancementProgress` |
| `net.minecraft.network.DisconnectionInfo` | `net.minecraft.network.DisconnectionDetails` |
| `net.minecraft.network.packet.s2c.play.PlaySoundS2CPacket` | `net.minecraft.network.protocol.game.ClientboundSoundPacket` |
| `net.minecraft.network.packet.c2s.play.ChatMessageC2SPacket` | `net.minecraft.network.protocol.game.ServerboundChatPacket` |
| `net.minecraft.server.network.ServerPlayNetworkHandler` | `net.minecraft.server.network.ServerGamePacketListenerImpl` |
| `net.minecraft.command.permission.Permission` | `net.minecraft.server.permissions.Permission` |
| `net.minecraft.command.permission.PermissionLevel` | `net.minecraft.server.permissions.PermissionLevel` |

### Major Method/Field Renames

| Yarn | Mojang | Context |
|------|--------|---------|
| `Text.literal("...")` | `Component.literal("...")` | Static factory |
| `Text.empty()` | `Component.empty()` | Static factory |
| `Text.of("...")` | `Component.nullToEmpty("...")` | Static factory |
| `.styled { }` | `.withStyle { }` | Style modifier on Component |
| `.withUnderline(true)` | `.withUnderlined(true)` | Style method |
| `player.networkHandler` | `player.connection` | ServerPlayer field |
| `.sendPacket(...)` | `.send(...)` | Connection method |
| `player.sendMessage(text, false)` | `player.sendSystemMessage(text)` | Send message to player |
| `source.sendFeedback(...)` | `source.sendSuccess(...)` | Command feedback |
| `source.sendError(...)` | `source.sendFailure(...)` | Command error |
| `server.playerManager` | `server.playerList` | MinecraftServer getter |
| `playerManager.playerList` | `playerList.players` | Get player list |
| `playerManager.maxPlayerCount` | `playerList.maxPlayers` | Max players |
| `playerManager.isOperator(entry)` | `playerList.isOp(nameAndId)` | Check operator |
| `playerManager.addToOperators(...)` | `playerList.op(...)` | Grant OP |
| `playerManager.removeFromOperators(...)` | `playerList.deop(...)` | Revoke OP |
| `playerManager.userBanList` | `playerList.bans` | Ban list |
| `banList.values()` | `banList.entries` | Get ban entries |
| `entry.key` | `entry.user` | StoredUserEntry key |
| `player.playerConfigEntry` | `player.nameAndId()` | Get NameAndId |
| `server.commandManager` | `server.commands` | Command manager |
| `server.commandSource` | `server.createCommandSourceStack()` | Command source |
| `commandManager.parseAndExecute(src, cmd)` | `commands.performPrefixedCommand(src, cmd)` | Execute command |
| `server.version` | `server.serverVersion` | Server version string |
| `server.tickTimes` | `server.tickTimesNanos` | Tick time array |
| `server.averageTickTime` | `server.currentSmoothedTickTime` | Average tick time |
| `server.worlds` | `server.allLevels` | All dimensions |
| `server.overworld` | `server.overworld()` | Overworld (method, not property) |
| `world.time` | `world.overworldClockTime` | World time |
| `world.chunkManager` | `world.chunkSource` | Chunk manager |
| `chunkManager.loadedChunkCount` | `chunkSource.chunkMap.size()` | Loaded chunks |
| `player.getDamageTracker()` | `player.getCombatTracker()` | Combat tracker |
| `tracker.getDeathMessage()` | `tracker.getDeathMessage()` | Same name |
| `player.clientOptions` | `player.clientInformation()` | Client settings |
| `Registries.SOUND_EVENT.getEntry(e)` | `BuiltInRegistries.SOUND_EVENT.wrapAsHolder(e)` | Registry holder |
| `SoundEvents.BLOCK_NOTE_BLOCK_PLING` | `SoundEvents.NOTE_BLOCK_PLING` | Sound event (prefix removed) |
| `advancement.comp_1913()` | `advancement.display()` | Advancement display |
| `display.shouldAnnounceToChat()` | `display.shouldAnnounceChat()` | Display method |
| `display.getTitle()` | `display.getTitle()` | Same |
| `tracker.getProgress(entry)` | `tracker.getOrStartProgress(holder)` | Advancement progress |
| `packet.chatMessage()` | `packet.message()` | Chat packet accessor |
| `Permission.Level(PermissionLevel.fromLevel(2))` | `Permission.HasCommandLevel(PermissionLevel.GAMEMASTERS)` | Permission check |
| `source.permissions` (field) | `source.permissions()` (method) | CommandSourceStack |
| `apiServices.comp_4407` | `services().profileRepository()` | Profile repository |
| `profileRepo.findByName(name)` | `profileRepo.findProfileByName(name)` | Lookup profile |

### PermissionLevel Enum Values (replaces `fromLevel(int)`)

| Level | Enum Value |
|-------|------------|
| 0 | `PermissionLevel.ALL` |
| 1 | `PermissionLevel.MODERATORS` |
| 2 | `PermissionLevel.GAMEMASTERS` |
| 3 | `PermissionLevel.ADMINS` |
| 4 | `PermissionLevel.OWNERS` |

---

## Phase 6: Update Mixin Targets

Mixin `@Mixin(Target.class)` annotations must reference Mojang class names:

| Yarn Target | Mojang Target |
|-------------|---------------|
| `ServerPlayerEntity.class` | `ServerPlayer.class` |
| `PlayerAdvancementTracker.class` | `PlayerAdvancements.class` |
| `PlayerManager.class` | `PlayerList.class` |
| `ServerPlayNetworkHandler.class` | `ServerGamePacketListenerImpl.class` |

Mixin `method` strings and `target` strings must also use Mojang names:

```java
// OLD:
@Inject(method = "onDeath", at = @At(value = "INVOKE",
    target = "Lnet/minecraft/entity/damage/DamageTracker;getDeathMessage()Lnet/minecraft/text/Text;"))

// NEW:
@Inject(method = "die", at = @At(value = "INVOKE",
    target = "Lnet/minecraft/world/damagesource/CombatTracker;getDeathMessage()Lnet/minecraft/network/chat/Component;"))
```

Common mixin method name changes:
| Yarn | Mojang |
|------|--------|
| `onDeath` | `die` |
| `onChatMessage` | `handleChat` |
| `grantCriterion` | `award` |
| `addToOperators` | `op` |
| `removeFromOperators` | `deop` |

`@Shadow` field names must also be updated (e.g., `owner` → `player` in PlayerAdvancements).

---

## Phase 7: Verify with the MC Jar

**ALWAYS verify names against the actual MC jar** rather than relying solely on this mapping table. The table covers common cases but MC 26.1+ may have additional changes.

```bash
# Find MC jar
JAR=$(find ~/.gradle/caches -name "minecraft-merged-deobf-*.jar" | head -1)

# Search for a class
jar tf "$JAR" | grep "YourClassName"

# Inspect methods/fields of a class
javap -p -cp "$JAR" fully.qualified.ClassName

# Example: find all methods on ServerPlayer
javap -p -cp "$JAR" net.minecraft.server.level.ServerPlayer | grep "methodName"
```

---

## Phase 8: Build and Fix Iteratively

```bash
JAVA_HOME=/path/to/jdk26 ./gradlew build
```

1. Fix compilation errors one at a time
2. Use `javap` to look up the correct Mojang names from the MC jar
3. Rebuild until clean
4. The `finalJar` (shadow jar with bundled deps) is the deployable artifact

### Common Build Errors and Fixes

| Error | Fix |
|-------|-----|
| `No Java compiler found` | Install JDK (not just JRE): `jdk-openjdk` package |
| `Cannot find Java installation matching languageVersion=25` | Set `jvmToolchain` to match installed JDK (e.g., 26) |
| `Configuration 'mappings' has no dependencies` | Either add `mappings(loom.officialMojangMappings())` or remove mappings entirely (preferred for 26.1+) |
| `Failed to find official mojang mappings for 26.1.x` | Remove the `mappings(...)` line — 26.1+ needs no mappings |
| `Unresolved reference 'JVM_26'` | Use `JvmTarget.JVM_25` (max in Kotlin 2.3.x) |
| `access-widener validation failed` | Update class/field paths in `.accesswidener` to Mojang names |
| `Zip64RequiredException` | Add `isZip64 = true` to ShadowJar tasks |
| Stale Gradle daemon | Run `./gradlew --stop` then rebuild |

---

## Checklist

- [ ] `gradle/libs.versions.toml` — versions updated, yarn removed
- [ ] `build.gradle.kts` — plugin ID, no mappings, Java 25, no remapJar, dependency configs
- [ ] `*.accesswidener` — `named` → `official`, paths updated
- [ ] `*.mixins.json` — `JAVA_25` compatibility level
- [ ] `fabric.mod.json` — dependency versions updated
- [ ] All `comp_####` references replaced with Mojang names
- [ ] All `net.minecraft.*` imports updated from Yarn to Mojang
- [ ] All mixin `@Mixin`, `method`, and `target` strings updated
- [ ] All `@Shadow` fields use correct Mojang names
- [ ] `sendMessage` → `sendSystemMessage`, `sendFeedback` → `sendSuccess`, etc.
- [ ] `./gradlew build` succeeds
- [ ] Output JAR tested on a MC server
