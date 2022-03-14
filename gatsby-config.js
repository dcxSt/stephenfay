module.exports = {
  siteMetadata: {
    title: "gatsby-personal",
  },
  plugins: [
		{
			resolve:"gatsby-plugin-disqus",
			options:{
				shortname:"stephenfay"
			}
		},
    "gatsby-plugin-image",
    {
      resolve: "gatsby-plugin-manifest",
      options: {
        icon: "src/images/icon.png",
      },
    },
    "gatsby-plugin-sharp",
    "gatsby-transformer-sharp",
    {
      resolve: "gatsby-transformer-remark",
      options: {
        plugins: [
          "gatsby-remark-katex",
          "gatsby-remark-copy-linked-files",
          {
            resolve: "gatsby-remark-images",
            options: {
              maxWidth: 800,
            },
          },
        ],
      },
    },
    "gatsby-plugin-mdx",
    {
      resolve: "gatsby-source-filesystem",
      options: {
        name: "src",
        path: "./src/",
      },
    },
  ],
};
