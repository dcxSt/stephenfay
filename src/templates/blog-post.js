import React from "react"
import { graphql } from "gatsby"
import Layout from "../components/layout"
import "katex/dist/katex.min.css" // katex math stylesheet

export default function BlogPost({ data }) {
  const post = data.markdownRemark
  return (
    <Layout>
      <h2 style={{ marginBottom:"5px"}}>{post.frontmatter.title}</h2>
      <h5 style={{ marginTop:"0px"}}>{post.frontmatter.date}</h5>
      <h5 style={{ marginTop:"3px"}}>Type : {post.frontmatter.type}</h5>
      <div dangerouslySetInnerHTML={{ __html: post.html }} />
    </Layout>
  )
}

export const query = graphql`
  query($slug: String!) {
    markdownRemark(fields: { slug: { eq: $slug } }) {
      html
      frontmatter {
        type
        title
        date
      }
    }
  }
`
