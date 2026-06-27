import apidocs from "@carrotsearch/eleventy-apidocs";
import pkg from "@carrotsearch/eleventy-apidocs/package.json" with { type: "json" };

export default async function (eleventyConfig) {
  return apidocs(eleventyConfig, {
    navigation: "src/navigation.json",
    logo: "src/logo.html",
    footer: "src/footer.html",
    contentDir: "src/content",
    apiKindOrder: ["endpoint", "option"],
    variables: {
      VERSION: pkg.version,
      SITE_OWNER: "Carrot Search"
    }
  });
}
