import React from "react"
import { useStaticQuery , graphql } from "gatsby"
import Layout from "../components/layout"
import { Link } from "gatsby"
import P153 from "../assets/p153.pdf"

export default function MathPosts({ data }) {
    console.log(data);
    return (
				<Layout>
                <h1>Math</h1>
                {data.allMarkdownRemark.edges.map(({ node }) => {
                    if (node.fileAbsolutePath.includes('mathposts'))
                        return (
                            <div key={node.id}>
                                <Link to={node.fields.slug} style={{ color:"inherit",textDectoration:"none",textDecorationLine:"none"}}><h4>{node.frontmatter.date} {node.frontmatter.title} <span style={{color:"#777"}}> type : {node.frontmatter.type}</span></h4></Link>
                                {node.excerpt}
                            </div>
                        )
                })}
                
                <iframe src={P153} width="400" height="400" title="lala"></iframe>
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
