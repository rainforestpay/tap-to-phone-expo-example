const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const withAndroidSigning = (config) => {
    console.log("[withAndroidSigning] Plugin loaded, projectRoot:", config.modRequest?.projectRoot);
    config = withDangerousMod(config, [
        "android",
        async (config) => {
            try {
                console.log("[withAndroidSigning] Plugin running");
                console.log("[withAndroidSigning] modRequest:", JSON.stringify(config.modRequest));

                const buildGradlePath = path.join(
                    config.modRequest.projectRoot,
                    "android/app/build.gradle",
                );

                console.log("[withAndroidSigning] Checking path:", buildGradlePath);
                console.log("[withAndroidSigning] Path exists:", fs.existsSync(buildGradlePath));

                if (!fs.existsSync(buildGradlePath)) {
                    console.log(
                        "[withAndroidSigning] build.gradle not found at",
                        buildGradlePath,
                    );
                    return config;
                }

                let contents = fs.readFileSync(buildGradlePath, "utf8");
                const before = contents.length;
                contents = applySigningConfig(contents, config.modRequest.projectRoot);
                const after = contents.length;
                fs.writeFileSync(buildGradlePath, contents);

                console.log(
                    `[withAndroidSigning] Updated build.gradle (${before} -> ${after} bytes)`,
                );
                return config;
            } catch (e) {
                console.error("[withAndroidSigning] Error:", e.message);
                throw e;
            }
        },
    ]);

    return withDangerousMod(config, [
        "android",
        async (config) => {
            try {
                const buildGradlePath = path.join(
                    config.modRequest.projectRoot,
                    "android/app/build.gradle",
                );

                let contents = fs.readFileSync(buildGradlePath, "utf8");

                const hasReleaseConfig = process.env.RELEASE_SIGNING_KEY_PATH &&
                    process.env.RELEASE_SIGNING_KEY_ALIAS &&
                    process.env.RELEASE_SIGNING_KEY_PASSWORD &&
                    process.env.RELEASE_SIGNING_STORE_PASSWORD;

                if (hasReleaseConfig) {
                    console.log("[withAndroidSigning] Updating release buildType to use signingConfigs.release");
                    contents = contents.replace(
                        /release\s*\{\s*\/\/\s*Caution![\s\S]*?\n\s*signingConfig\s+signingConfigs\.debug/,
                        `release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.release`
                    );
                } else {
                    console.log("[withAndroidSigning] Release env vars not set, keeping debug signing for release");
                }

                fs.writeFileSync(buildGradlePath, contents);
                return config;
            } catch (e) {
                console.error("[withAndroidSigning] Error updating buildTypes:", e.message);
                throw e;
            }
        },
    ]);
};

function applySigningConfig(buildGradleContent, projectRoot) {
    const debugPath = process.env.DEBUG_SIGNING_KEY_PATH;
    const debugAlias = process.env.DEBUG_SIGNING_KEY_ALIAS;
    const debugKeyPassword = process.env.DEBUG_SIGNING_KEY_PASSWORD;
    const debugStorePassword = process.env.DEBUG_SIGNING_STORE_PASSWORD;

    const releasePath = process.env.RELEASE_SIGNING_KEY_PATH;
    const releaseAlias = process.env.RELEASE_SIGNING_KEY_ALIAS;
    const releaseKeyPassword = process.env.RELEASE_SIGNING_KEY_PASSWORD;
    const releaseStorePassword = process.env.RELEASE_SIGNING_STORE_PASSWORD;

    const resolvePathFn = (filePath, root) => {
        if (!filePath) return null;
        if (filePath.startsWith('/')) return filePath;
        return path.join(root, filePath);
    };

    const debugResolvedPath = resolvePathFn(debugPath, projectRoot);
    const releaseResolvedPath = resolvePathFn(releasePath, projectRoot);

    let signingConfigBlock = `    signingConfigs {`;

    if (debugResolvedPath && debugAlias && debugKeyPassword && debugStorePassword) {
        console.log("[applySigningConfig] Including debug signing config");
        signingConfigBlock += `
        debug {
            storeFile file('${debugResolvedPath}')
            storePassword '${debugStorePassword}'
            keyAlias '${debugAlias}'
            keyPassword '${debugKeyPassword}'
        }`;
    } else if (debugPath || debugAlias || debugKeyPassword || debugStorePassword) {
        console.log("[applySigningConfig] Debug signing variables incomplete, skipping debug config");
    }

    if (releaseResolvedPath && releaseAlias && releaseKeyPassword && releaseStorePassword) {
        console.log("[applySigningConfig] Including release signing config");
        signingConfigBlock += `
        release {
            storeFile file('${releaseResolvedPath}')
            storePassword '${releaseStorePassword}'
            keyAlias '${releaseAlias}'
            keyPassword '${releaseKeyPassword}'
        }`;
    } else if (releasePath || releaseAlias || releaseKeyPassword || releaseStorePassword) {
        console.warn("[applySigningConfig] Release signing variables incomplete");
    }

    signingConfigBlock += `
    }`;

    // Find and replace signingConfigs block using brace counting
    let startIndex = buildGradleContent.indexOf("signingConfigs");
    if (startIndex === -1) {
        console.log(
            "[applySigningConfig] signingConfigs not found, inserting before buildTypes",
        );
        const buildTypesIndex = buildGradleContent.indexOf("buildTypes");
        if (buildTypesIndex !== -1) {
            return (
                buildGradleContent.substring(0, buildTypesIndex) +
                signingConfigBlock +
                "\n    " +
                buildGradleContent.substring(buildTypesIndex)
            );
        }
        return buildGradleContent;
    }

    const openBrace = buildGradleContent.indexOf("{", startIndex);
    if (openBrace === -1) {
        console.log("[applySigningConfig] Could not find opening brace");
        return buildGradleContent;
    }

    let braceCount = 1;
    let endIndex = -1;
    for (let i = openBrace + 1; i < buildGradleContent.length; i++) {
        if (buildGradleContent[i] === "{") braceCount++;
        else if (buildGradleContent[i] === "}") {
            braceCount--;
            if (braceCount === 0) {
                endIndex = i + 1;
                break;
            }
        }
    }

    if (endIndex === -1) {
        console.log("[applySigningConfig] Could not find closing brace");
        return buildGradleContent;
    }

    console.log(
        `[applySigningConfig] Replacing signingConfigs from ${startIndex} to ${endIndex}`,
    );

    return (
        buildGradleContent.substring(0, startIndex) +
        signingConfigBlock +
        buildGradleContent.substring(endIndex)
    );
}

module.exports = withAndroidSigning;
