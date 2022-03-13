import React from "react"
import { useStaticQuery , graphql } from "gatsby"
import Layout from "../components/layout"
import { Link } from "gatsby"

export default function MathPosts({ data }) {
    console.log(data);
    return (
        <Layout>
            <h1>Math</h1>
            {data.allMarkdownRemark.edges.map(({ node }) => {
                if (node.fileAbsolutePath.includes('mathposts'))
                    return (
                        <div key={node.id}>
                            <Link to={node.fields.slug} style={{ color:"inherit",textDectoration:"none",textDecorationLine:"none"}}><h4>{node.frontmatter.date} {node.frontmatter.title}</h4></Link>
                            {node.excerpt}
                        </div>
                    )
            })}

          <div key="p153">
            <Link to="./p153/" style={{ color:"inherit",textDectoration:"none",textDecorationLine:"none"}}>
              <h4>2019 Project Euler Problem 153</h4>
            </Link>
          </div>

        </Layout>
    );
}



export const query = graphql`
    query {
        allMarkdownRemark (sort: { fields: [frontmatter___date], order:DESC}) {
            edges {
              node {
                  id
                  excerpt
                  frontmatter {
                      title
                      date
                      type
                  }
                  fileAbsolutePath
                  timeToRead
                  fields {
                      slug
                  }
              }
            }
        }
    }
`
