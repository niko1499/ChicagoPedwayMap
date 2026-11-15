"""Render the ground image.   Run from anywhere:   python bake/background.py [--force]
Turns ../Images/Background.svg (Inkscape) into bake/ground.webp (lossless), which build.py embeds in ../3d/index.html
so the ground works however the page is opened (also straight from a file). Commit ground.webp: building only needs
Inkscape when the SVG changed. build.py runs this; it only re-renders when the SVG is newer than ground.webp.
The SVG page must cover the same area as the map PDF page (map units 0..1204 x 0..1007): the whole page is
stretched over the ground plane, so anything moved relative to the page will not line up with the corridors."""
import os,shutil,subprocess,sys,tempfile
import cv2
HERE=os.path.dirname(os.path.abspath(__file__))
SVG=os.path.normpath(os.path.join(HERE,'..','..','Images','Background.svg'))
OUT=os.path.join(HERE,'ground.webp')
WIDTH=4096  # px; 4096 is the largest texture every WebGL device supports

def inkscape():
    for p in [shutil.which('inkscape'),r'C:\Program Files\Inkscape\bin\inkscape.com',r'C:\Program Files\Inkscape\bin\inkscape.exe',
              '/Applications/Inkscape.app/Contents/MacOS/inkscape']:
        if p and os.path.exists(p):return p

if not os.path.exists(SVG):sys.exit(f'background: {SVG} not found')
if os.path.exists(OUT) and os.path.getmtime(OUT)>=os.path.getmtime(SVG) and '--force' not in sys.argv:
    print('background: ground.webp is up to date');sys.exit()
ink=inkscape()
if not ink:
    print('background: Inkscape not found, ground.webp NOT updated (install it from https://inkscape.org)');sys.exit(0 if os.path.exists(OUT) else 1)
with tempfile.TemporaryDirectory() as td:
    png=os.path.join(td,'ground.png')
    r=subprocess.run([ink,'--export-type=png','--export-area-page',f'--export-width={WIDTH}','--export-background=#ffffff',
                      '--export-background-opacity=1',f'--export-filename={png}',SVG],capture_output=True,text=True)
    im=cv2.imread(png,cv2.IMREAD_COLOR) if os.path.exists(png) else None
    if r.returncode or im is None:sys.exit('background: Inkscape failed\n'+r.stderr[-800:])
    assert cv2.imwrite(OUT,im,[cv2.IMWRITE_WEBP_QUALITY,101])  # quality above 100 = lossless
print('background: wrote',OUT,f'{im.shape[1]}x{im.shape[0]}',os.path.getsize(OUT)//1024,'KB')
