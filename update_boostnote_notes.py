# copies and formats boostnote notes into notes

import os
import cson

GJ_NOTES_DIR = "/Users/steve/Documents/code/stephenfay/src/pages/notes"
BN_NOTES_DIR = "/Users/steve/boostnote/notes"

def get_dict_from_cson(file_path):
    with open(file_path,'r') as f:
        cson_string = f.read()
    cson_dict = cson.loads(cson_string)
    return cson_dict

for bn_fname in [i for i in os.listdir(BN_NOTES_DIR) if i[-5:]==".cson"]:
    try:
        bn_path = BN_NOTES_DIR + "/" + bn_fname
        cson_dict = get_dict_from_cson(bn_path)
        if "publish-note" in cson_dict["tags"]:
            content = cson_dict["content"]
            title = cson_dict["title"]
            date = cson_dict["createdAt"][:10]

            # Generate Frontmatter
            frontmatter = "---\n"
            frontmatter += f"title: \"{title}\"\n"
            frontmatter += "author: \"Stephen Fay\"\n"
            frontmatter += f"date: \"{date}\"\n"
            frontmatter += "---\n\n"

            # delete first two lines of content
            # these are the title and the date
            content = "\n".join(content.split("\n")[2:])

            # concat frontmatter and content for gatsby
            gatsby_formatted_content = frontmatter + content

            # name of the file we will save in gatsby site
            gj_fname = title.replace(" ","_") + ".md"
            gj_path = GJ_NOTES_DIR + "/" + gj_fname

            # (over)write the file
            print(f"writing to {gj_path}")
            f = open(gj_path,"w")
            f.write(gatsby_formatted_content)
            f.close()
    except:
        print(f"something went wrong while parsing\n{bn_fname}")

print("\n\nDONE, bye")





