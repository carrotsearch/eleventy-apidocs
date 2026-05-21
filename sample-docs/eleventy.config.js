import apidocs from "@carrotsearch/eleventy-apidocs";

export default async function (eleventyConfig) {
  return apidocs(eleventyConfig, {
    navigation: "src/navigation.json",
    logo: "src/logo.html",
    footer: "src/footer.html",
    contentDir: "src/content",
    variables: {
      VERSION: "0.1.0",
      SITE_OWNER: "Carrot Search"
    }
  });
}
