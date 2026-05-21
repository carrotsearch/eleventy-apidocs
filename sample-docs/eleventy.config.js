import apidocs from "@carrotsearch/eleventy-apidocs";

export default async function (eleventyConfig) {
  return apidocs(eleventyConfig, {
    navigation: "src/navigation.json",
    logo: "src/logo.html",
    footer: "src/footer.html",
    contentDir: "src/content"
  });
}
