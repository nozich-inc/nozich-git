import { $ } from 'bun';

const img = 'nozich/git'

async function main() {
    await $`docker login -u ${process.env.DOCKER_USERNAME} -p ${process.env.DOCKER_ACCESS_TOKEN}`;

    await $`docker pull ${img}:latest`

    // Anil's MB Pro 250225: linux/arm64, linux/amd64, linux/riscv64, linux/ppc64le, linux/s390x, linux/386, linux/mips64le, linux/arm/v7, linux/arm/v6
    const inspect = await $`docker buildx inspect | grep 'Platforms:' | sed 's/Platforms: //'`.text();

    // Manuelly set the platforms
    const inspectionList = [];
    if (inspect.includes('linux/arm64')) { inspectionList.push('linux/arm64'); }
    if (inspect.includes('linux/amd64')) { inspectionList.push('linux/amd64'); }
    const inspects = inspectionList.join(',');
    console.log(`inspects`, inspects);

    const platforms = inspects.split(',').map(e => e.trim()).map((p) => ({
        platform: p,
        os: p.split('/')[0],
        arch: p.split('/')[1],
        tag: p.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
    }));

    console.log(`platforms`, JSON.stringify(platforms));
    // console.log(`platforms`, platforms.map((p) => p.tag).join(','));

    const built = (await Promise.all(platforms.map(async ({ platform, tag }) => {
        console.log({ platform, img, tag });

        const build = await $`docker buildx build --platform=${platform} -t ${img}:${tag} --push .`;

        console.log({ platform, tag, build });

        console.log(`[BUILD] [END] [${platform}] [${tag}] {exitCode: ${build.exitCode}}`);

        return (build.exitCode === 0) && tag
    }))).filter(Boolean);

    console.log(`built`, built);

    if (built.length === 0) {
        console.error('No images were built');
        return;
    }

    const currentsFetch = await fetch(`https://registry.hub.docker.com/v2/repositories/${img}/tags/`)
        .then((res) => res.json())
        .then((data) => data.results);

    console.log(`currentsFetch`, currentsFetch);

    const currents = currentsFetch.find((r) => r.name === 'latest')
        .images.map((i) => ({
            ...i,
            arch: i.architecture,
            tag: i.variant ? `${i.os}-${i.architecture}-${i.variant}` : `${i.os}-${i.architecture}`
        }));

    const annotates = currents || [];

    console.log(`annotates`, annotates);

    const news = platforms.filter((p) => built.includes(p.tag));

    console.log(`news`, news);

    news.forEach((p) => {
        if (annotates.find((a) => a.tag === p.tag)) return;
        annotates.push(p);
    });

    console.log(`annotates`, annotates.map(({ tag, os, arch }) => ({ tag, os, arch })));

    const tags = annotates.map(({ tag }) => `${img}:${tag}`)

    tags.unshift(`${img}:latest`)

    await $`docker manifest create --amend ${tags}`;

    await Promise.all(annotates.map(async ({ os, arch, tag }) => {
        return $`docker manifest annotate ${img}:latest ${img}:${tag} --os ${os} --arch ${arch}`;
    }));

    await $`docker manifest push --purge ${img}:latest`
}

main();

